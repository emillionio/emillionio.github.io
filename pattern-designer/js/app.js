/* app.js — Crochet Pattern Studio
 *
 * A scene-graph canvas editor tuned for iPad + Apple Pencil:
 *   - Tools: stamp (place stitch symbols), draw (freeform pen), erase,
 *     select/transform, pan.
 *   - Draw-and-hold shape recognition: sketch a shape then hold still and it
 *     snaps to a clean line / ellipse / rectangle / triangle (Freeform-style).
 *   - Transform handles: selected stamps AND shapes get an 8-handle bounding
 *     box that stretches them non-uniformly.
 *   - The Key: built-in stitch symbols + markers + user-drawn custom icons.
 *   - Pan & pinch-zoom, start/end step notes, undo/redo, autosave, PNG export.
 *
 * Plain ES5-ish so it runs by opening index.html directly (file://). No build.
 *
 * Object model (all geometry in WORLD coords):
 *   stamp   {id,type:'stamp',symbolId,x,y,size,sx,sy,rot,color}   sx/sy = stretch
 *   stroke  {id,type:'stroke',color,width,points:[{x,y}]}
 *   shape   {id,type:'shape',kind,color,width, ...geometry}
 *           kind 'line'     -> x1,y1,x2,y2
 *           kind 'rect'     -> x,y,w,h
 *           kind 'ellipse'  -> cx,cy,rx,ry
 *           kind 'triangle' -> points:[{x,y}x3]
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- state
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var workspace = document.getElementById('workspace');

  var COLORS = ['#4a3b34', '#b6727e', '#5b8a72', '#3f6e8c', '#c08a3e', '#7a5ea8'];

  var HOLD_MS = 400;          // hold-still duration that triggers shape snap
  var MOVE_EPS = 5;           // screen px of motion that resets the hold timer

  var state = {
    tool: 'stamp',
    color: COLORS[0],
    size: 34,
    activeSymbolId: 'sc',
    view: { x: 0, y: 0, scale: 1 },
    objects: [],
    selectedId: null,
    customSymbols: [],
    startSteps: '',
    endSteps: '',
    settings: {
      lengthOnDrag: false,   // placement-drag: false = set direction, true = stretch length
      brushSpacing: 1.1      // Stitch Brush: gap between stamps, as a multiple of stitch size
    }
  };

  var history = [], future = [];
  var brush = null;          // active Stitch Brush stroke accumulator
  var playback = { active: false, order: [], pos: {}, startTime: 0, perStitch: 300, raf: 0 };
  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var nextId = 1;
  function uid() { return 'o' + (nextId++) + '_' + Date.now().toString(36); }

  // ---------------------------------------------------- coordinate helpers
  function toWorld(sx, sy) {
    return { x: (sx - state.view.x) / state.view.scale, y: (sy - state.view.y) / state.view.scale };
  }
  function toScreen(wx, wy) {
    return { x: wx * state.view.scale + state.view.x, y: wy * state.view.scale + state.view.y };
  }
  function eventPos(e) {
    var r = canvas.getBoundingClientRect();
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  // ------------------------------------------------------------ rendering
  function resize() {
    var w = workspace.clientWidth, h = workspace.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    render();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    ctx.save();
    ctx.translate(state.view.x, state.view.y);
    ctx.scale(state.view.scale, state.view.scale);
    var pb = playback.active ? playProgress() : null;
    for (var i = 0; i < state.objects.length; i++) {
      var o = state.objects[i];
      if (pb) {
        var idx = playback.pos[o.id];
        if (idx === undefined || idx > pb.full) continue;        // not revealed yet
        ctx.globalAlpha = (idx === pb.full) ? pb.frac : 1;        // newest stitch fades in
      }
      drawObject(ctx, o);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (!playback.active && state.selectedId && (state.tool === 'select' || state.tool === 'stamp')) drawSelectionUI();
  }

  function drawBackground() {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    var step = 28 * state.view.scale;
    if (step < 10) step *= 2;
    ctx.fillStyle = 'rgba(91,74,66,0.10)';
    var ox = state.view.x % step, oy = state.view.y % step;
    for (var x = ox; x < w; x += step)
      for (var y = oy; y < h; y += step) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
  }

  // Wrap a 2D context so a stitch symbol's GEOMETRY scales by (sx,sy) while the
  // pen width stays constant -> a stretched icon keeps crisp, uniform strokes.
  function scaledCtx(g, sx, sy) {
    if (sx === 1 && sy === 1) return g;
    return new Proxy(g, {
      get: function (t, p) {
        switch (p) {
          case 'moveTo': return function (x, y) { t.moveTo(x * sx, y * sy); };
          case 'lineTo': return function (x, y) { t.lineTo(x * sx, y * sy); };
          case 'translate': return function (x, y) { t.translate(x * sx, y * sy); };
          case 'ellipse': return function (x, y, rx, ry, rot, a0, a1, ccw) { t.ellipse(x * sx, y * sy, rx * sx, ry * sy, rot || 0, a0, a1, ccw); };
          case 'arc': return function (x, y, r, a0, a1, ccw) { t.ellipse(x * sx, y * sy, r * sx, r * sy, 0, a0, a1, ccw); };
          case 'quadraticCurveTo': return function (cx, cy, x, y) { t.quadraticCurveTo(cx * sx, cy * sy, x * sx, y * sy); };
          case 'rect': return function (x, y, w, h) { t.rect(x * sx, y * sy, w * sx, h * sy); };
        }
        var v = t[p];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set: function (t, p, v) { t[p] = v; return true; }
    });
  }

  // draw one object onto graphics context g (used for screen + export)
  function drawObject(g, o) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = o.color; g.fillStyle = o.color;

    if (o.type === 'stroke') {
      g.lineWidth = o.width;
      g.beginPath();
      var p = o.points;
      for (var i = 0; i < p.length; i++) i ? g.lineTo(p[i].x, p[i].y) : g.moveTo(p[0].x, p[0].y);
      g.stroke();

    } else if (o.type === 'stamp') {
      g.translate(o.x, o.y);
      g.rotate(o.rot || 0);
      g.lineWidth = Math.max(1.5, o.size * 0.06);   // constant -> uniform stroke
      var prev = ctx; ctx = scaledCtx(g, o.sx || 1, o.sy || 1);
      drawSymbolById(o.symbolId, o.size);
      ctx = prev;

    } else if (o.type === 'shape') {
      g.lineWidth = o.width;
      g.beginPath();
      if (o.kind === 'line') { g.moveTo(o.x1, o.y1); g.lineTo(o.x2, o.y2); }
      else if (o.kind === 'rect') { g.rect(o.x, o.y, o.w, o.h); }
      else if (o.kind === 'ellipse') { g.ellipse(o.cx, o.cy, Math.abs(o.rx), Math.abs(o.ry), 0, 0, Math.PI * 2); }
      else if (o.kind === 'triangle') {
        o.points.forEach(function (pt, i) { i ? g.lineTo(pt.x, pt.y) : g.moveTo(pt.x, pt.y); });
        g.closePath();
      }
      g.stroke();
    }
    g.restore();
  }

  function drawSymbolById(id, size) {
    var custom = findCustom(id);
    if (custom) { drawCustomStrokes(ctx, custom, size); return; }
    var sym = CrochetSymbols.byId(id);
    if (sym) sym.draw(ctx, size);
  }
  function drawCustomStrokes(g, sym, size) {
    g.lineWidth = Math.max(1.5, size * 0.05);
    for (var i = 0; i < sym.strokes.length; i++) {
      var s = sym.strokes[i];
      g.beginPath();
      for (var j = 0; j < s.length; j++) { var px = s[j].x * size, py = s[j].y * size; j ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
  }
  function findCustom(id) {
    for (var i = 0; i < state.customSymbols.length; i++) if (state.customSymbols[i].id === id) return state.customSymbols[i];
    return null;
  }

  // ----------------------------------------------- geometry: AABB / transform
  function getAABB(o) {
    if (o.type === 'stamp') {
      var hx = o.size * 0.6 * (o.sx || 1), hy = o.size * 0.6 * (o.sy || 1), a = o.rot || 0;
      var cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));   // rotated AABB
      var ex = hx * cs + hy * sn, ey = hx * sn + hy * cs;
      return { x: o.x - ex, y: o.y - ey, w: ex * 2, h: ey * 2 };
    }
    if (o.type === 'shape') {
      if (o.kind === 'rect') return { x: o.x, y: o.y, w: o.w, h: o.h };
      if (o.kind === 'ellipse') return { x: o.cx - Math.abs(o.rx), y: o.cy - Math.abs(o.ry), w: Math.abs(o.rx) * 2, h: Math.abs(o.ry) * 2 };
      if (o.kind === 'line') return aabbOfPoints([{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }]);
      if (o.kind === 'triangle') return aabbOfPoints(o.points);
    }
    return aabbOfPoints(o.points); // stroke
  }
  function aabbOfPoints(pts) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      minx = Math.min(minx, pts[i].x); miny = Math.min(miny, pts[i].y);
      maxx = Math.max(maxx, pts[i].x); maxy = Math.max(maxy, pts[i].y);
    }
    return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
  }

  function rotv(x, y, a) { var c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c }; }
  function stampHalf(o) { return { hx: o.size * 0.6 * (o.sx || 1), hy: o.size * 0.6 * (o.sy || 1) }; }

  function translateObj(o, dx, dy) {
    if (o.type === 'stamp') { o.x += dx; o.y += dy; }
    else if (o.type === 'shape') {
      if (o.kind === 'rect') { o.x += dx; o.y += dy; }
      else if (o.kind === 'ellipse') { o.cx += dx; o.cy += dy; }
      else if (o.kind === 'line') { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
      else if (o.kind === 'triangle') o.points.forEach(function (p) { p.x += dx; p.y += dy; });
    } else o.points.forEach(function (p) { p.x += dx; p.y += dy; });
  }

  // scale geometry around anchor (ax,ay) by (fx,fy)
  function scaleObj(o, ax, ay, fx, fy) {
    function sp(px, py) { return { x: ax + (px - ax) * fx, y: ay + (py - ay) * fy }; }
    if (o.type === 'stamp') {
      var c = sp(o.x, o.y); o.x = c.x; o.y = c.y;
      o.sx = (o.sx || 1) * fx; o.sy = (o.sy || 1) * fy;
    } else if (o.type === 'shape') {
      if (o.kind === 'rect') {
        var a = sp(o.x, o.y), b = sp(o.x + o.w, o.y + o.h);
        o.x = Math.min(a.x, b.x); o.y = Math.min(a.y, b.y); o.w = Math.abs(b.x - a.x); o.h = Math.abs(b.y - a.y);
      } else if (o.kind === 'ellipse') {
        var cc = sp(o.cx, o.cy); o.cx = cc.x; o.cy = cc.y; o.rx = Math.abs(o.rx * fx); o.ry = Math.abs(o.ry * fy);
      } else if (o.kind === 'line') {
        var p1 = sp(o.x1, o.y1), p2 = sp(o.x2, o.y2); o.x1 = p1.x; o.y1 = p1.y; o.x2 = p2.x; o.y2 = p2.y;
      } else if (o.kind === 'triangle') {
        o.points = o.points.map(function (p) { return sp(p.x, p.y); });
      }
    } else {
      o.points = o.points.map(function (p) { return sp(p.x, p.y); });
    }
  }

  // --------------------------------------------------------- selection UI
  var handleHits = [];   // [{id,x,y}] in screen px, recomputed each render
  function handlePoints(b) {
    var L = b.x, T = b.y, R = b.x + b.w, B = b.y + b.h, MX = b.x + b.w / 2, MY = b.y + b.h / 2;
    return [
      { id: 'nw', x: L, y: T }, { id: 'n', x: MX, y: T }, { id: 'ne', x: R, y: T },
      { id: 'e', x: R, y: MY }, { id: 'se', x: R, y: B }, { id: 's', x: MX, y: B },
      { id: 'sw', x: L, y: B }, { id: 'w', x: L, y: MY }
    ];
  }
  function drawSelectionUI() {
    var sel = byId(state.selectedId); if (!sel) return;
    ctx.save();
    ctx.strokeStyle = '#b6727e'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 1.5;
    if (sel.type === 'stamp') drawStampSelection(sel);
    else drawAABBSelection(sel);
    ctx.restore();
  }

  function drawHandles() {
    handleHits.forEach(function (hp) {
      var s = (hp.id.length === 2) ? 6 : 5;     // corners slightly larger
      ctx.beginPath(); ctx.rect(hp.x - s, hp.y - s, s * 2, s * 2); ctx.fill(); ctx.stroke();
    });
  }

  function drawAABBSelection(sel) {
    var b = getAABB(sel);
    var nw = toScreen(b.x, b.y), se = toScreen(b.x + b.w, b.y + b.h);
    var box = { x: nw.x - 4, y: nw.y - 4, w: (se.x - nw.x) + 8, h: (se.y - nw.y) + 8 };
    ctx.setLineDash([6, 4]); ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]);
    handleHits = handlePoints(box);
    drawHandles();
  }

  // rotated frame + 8 stretch handles + a rotation grip, drawn in the stamp's
  // own (rotated) local axes so the box turns with the icon.
  function drawStampSelection(o) {
    var hh = stampHalf(o), pad = 7 / state.view.scale;
    var hx = hh.hx + pad, hy = hh.hy + pad, a = o.rot || 0;
    function L2S(lx, ly) { var p = rotv(lx, ly, a); return toScreen(o.x + p.x, o.y + p.y); }
    var corners = [L2S(-hx, -hy), L2S(hx, -hy), L2S(hx, hy), L2S(-hx, hy)];
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    corners.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    var topMid = L2S(0, -hy), grip = L2S(0, -hy - 26 / state.view.scale);
    ctx.beginPath(); ctx.moveTo(topMid.x, topMid.y); ctx.lineTo(grip.x, grip.y); ctx.stroke();
    handleHits = [
      { id: 'nw', x: corners[0].x, y: corners[0].y }, { id: 'ne', x: corners[1].x, y: corners[1].y },
      { id: 'se', x: corners[2].x, y: corners[2].y }, { id: 'sw', x: corners[3].x, y: corners[3].y },
      { id: 'n', x: topMid.x, y: topMid.y }, { id: 'e', x: L2S(hx, 0).x, y: L2S(hx, 0).y },
      { id: 's', x: L2S(0, hy).x, y: L2S(0, hy).y }, { id: 'w', x: L2S(-hx, 0).x, y: L2S(-hx, 0).y }
    ];
    drawHandles();
    ctx.beginPath(); ctx.arc(grip.x, grip.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    handleHits.push({ id: 'rot', x: grip.x, y: grip.y });
  }
  function hitHandle(px, py) {
    for (var i = 0; i < handleHits.length; i++)
      if (Math.hypot(handleHits[i].x - px, handleHits[i].y - py) <= 16) return handleHits[i].id;
    return null;
  }

  // --------------------------------------------------------- hit testing
  function byId(id) { for (var i = 0; i < state.objects.length; i++) if (state.objects[i].id === id) return state.objects[i]; return null; }
  function inAABB(o, wx, wy, pad) {
    var b = getAABB(o); pad = pad || 6;
    return wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad;
  }
  function distToSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function hitTest(wx, wy) {
    for (var i = state.objects.length - 1; i >= 0; i--) {
      var o = state.objects[i];
      if (o.type === 'stamp') { if (inAABB(o, wx, wy, 4)) return o; }
      else if (o.type === 'shape') {
        if (o.kind === 'line') { if (distToSeg(wx, wy, o.x1, o.y1, o.x2, o.y2) <= Math.max(8, o.width)) return o; }
        else if (inAABB(o, wx, wy, 4)) return o;
      } else {
        for (var j = 0; j < o.points.length; j++)
          if (Math.hypot(wx - o.points[j].x, wy - o.points[j].y) <= Math.max(8, o.width)) return o;
      }
    }
    return null;
  }

  // ---------------------------------------------- SHAPE RECOGNITION (hold)
  function recognizeShape(pts) {
    if (!pts || pts.length < 4) return null;
    var bb = aabbOfPoints(pts);
    var diag = Math.hypot(bb.w, bb.h);
    if (diag < 16) return null;

    var start = pts[0], end = pts[pts.length - 1];
    var closed = Math.hypot(end.x - start.x, end.y - start.y) < 0.28 * diag;

    if (!closed) {
      var dev = maxPerpDist(pts, start, end);
      if (dev < 0.14 * diag) return snapLine(start, end);
      return null;                              // open & curvy -> leave freeform
    }

    // closed: decide round vs polygonal
    if (isRound(pts, bb)) return makeEllipse(bb);

    var corners = rdp(pts, 0.05 * diag);
    if (corners.length > 1 &&
        Math.hypot(corners[0].x - corners[corners.length - 1].x, corners[0].y - corners[corners.length - 1].y) < 0.12 * diag)
      corners.pop();

    if (corners.length === 3) return { id: '', type: 'shape', kind: 'triangle', points: corners.map(function (p) { return { x: p.x, y: p.y }; }) };
    if (corners.length === 4) return makeRect(bb);
    return makeEllipse(bb);
  }

  function makeRect(bb) {
    var x = bb.x, y = bb.y, w = bb.w, h = bb.h;
    if (Math.abs(w - h) < 0.18 * Math.max(w, h)) {           // snap near-square
      var s = (w + h) / 2, cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
      x = cx - s / 2; y = cy - s / 2; w = s; h = s;
    }
    return { id: '', type: 'shape', kind: 'rect', x: x, y: y, w: w, h: h };
  }
  function makeEllipse(bb) {
    var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, rx = bb.w / 2, ry = bb.h / 2;
    if (Math.abs(rx - ry) < 0.16 * Math.max(rx, ry)) { var r = (rx + ry) / 2; rx = r; ry = r; }  // snap circle
    return { id: '', type: 'shape', kind: 'ellipse', cx: cx, cy: cy, rx: rx, ry: ry };
  }
  function snapLine(a, b) {
    var ang = Math.atan2(b.y - a.y, b.x - a.x);
    var len = Math.hypot(b.x - a.x, b.y - a.y);
    var snap = Math.PI / 4;                                   // 45° increments
    var s = Math.round(ang / snap) * snap;
    if (Math.abs(s - ang) < (10 * Math.PI / 180)) ang = s;    // only if within 10°
    return { id: '', type: 'shape', kind: 'line', x1: a.x, y1: a.y, x2: a.x + len * Math.cos(ang), y2: a.y + len * Math.sin(ang) };
  }
  function maxPerpDist(pts, a, b) {
    var m = 0; for (var i = 0; i < pts.length; i++) m = Math.max(m, distToSeg(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y)); return m;
  }
  // ellipse-normalized radius variance: low => round (circle/ellipse), high => corners stick out
  function isRound(pts, bb) {
    var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, rx = bb.w / 2 || 1, ry = bb.h / 2 || 1;
    var ratios = [], sum = 0;
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].x - cx, dy = pts[i].y - cy;
      var th = Math.atan2(dy, dx);
      var exp = (rx * ry) / Math.sqrt(Math.pow(ry * Math.cos(th), 2) + Math.pow(rx * Math.sin(th), 2));
      var r = Math.hypot(dx, dy) / (exp || 1);
      ratios.push(r); sum += r;
    }
    var mean = sum / ratios.length, varr = 0;
    for (var k = 0; k < ratios.length; k++) varr += Math.pow(ratios[k] - mean, 2);
    return Math.sqrt(varr / ratios.length) / (mean || 1) < 0.07;
  }
  // Ramer–Douglas–Peucker corner extraction
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var dmax = 0, idx = 0, a = pts[0], b = pts[pts.length - 1];
    for (var i = 1; i < pts.length - 1; i++) {
      var d = distToSeg(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps) {
      var left = rdp(pts.slice(0, idx + 1), eps);
      var right = rdp(pts.slice(idx), eps);
      return left.slice(0, left.length - 1).concat(right);
    }
    return [a, b];
  }

  // --------------------------------------------------------- interactions
  var active = null;

  function pointerDown(e) {
    if (e.target.closest('.panel, .steps, .toolbar, .modal, .settings-pop')) return;
    e.preventDefault();
    if (playback.active) { stopPlayback(); return; }   // tap during timelapse = stop
    var pos = eventPos(e);
    if (e.touches && e.touches.length === 2) { startPinch(e); return; }
    var w = toWorld(pos.x, pos.y);

    if (state.tool === 'pan') { active = { mode: 'pan', sx: pos.x, sy: pos.y, ox: state.view.x, oy: state.view.y }; return; }

    if (state.tool === 'draw') {
      pushHistory();
      var stroke = { id: uid(), type: 'stroke', color: state.color, width: Math.max(2, state.size * 0.12), points: [w] };
      state.objects.push(stroke);
      active = { mode: 'draw', obj: stroke, lastScreen: pos, locked: false };
      scheduleHold();
      render(); return;
    }

    if (state.tool === 'erase') {
      var hit = hitTest(w.x, w.y);
      if (hit) { pushHistory(); removeObject(hit.id); render(); }
      active = { mode: 'erase' }; return;
    }

    if (state.tool === 'stamp') {
      // tap an existing stitch (or its handle) to select/transform; empty = place
      if (handleSelectDown(pos, w, true)) { render(); return; }
      pushHistory();
      var sym = CrochetSymbols.byId(state.activeSymbolId);
      var col = (sym && sym.color) ? sym.color : state.color;   // markers keep their fixed color
      var stamp = { id: uid(), type: 'stamp', symbolId: state.activeSymbolId, x: w.x, y: w.y, size: state.size, sx: 1, sy: 1, rot: 0, color: col };
      state.objects.push(stamp);
      state.selectedId = stamp.id;
      active = { mode: 'place', obj: stamp, anchor: { x: w.x, y: w.y } };
      render(); return;
    }

    if (state.tool === 'brush') {
      // Stitch Brush: drag to lay down evenly-spaced stitches like a Procreate
      // stamp brush. Each one is its own object, so Select can separate them.
      pushHistory();
      state.objects.push(makeBrushStamp(w));
      brush = { last: { x: w.x, y: w.y }, dAccum: 0 };
      state.selectedId = null;
      active = { mode: 'brush' };
      render(); return;
    }

    if (state.tool === 'select') {
      handleSelectDown(pos, w, false);
      render(); return;
    }
  }

  function makeBrushStamp(p) {
    var sym = CrochetSymbols.byId(state.activeSymbolId);
    var col = (sym && sym.color) ? sym.color : state.color;
    return { id: uid(), type: 'stamp', symbolId: state.activeSymbolId, x: p.x, y: p.y, size: state.size, sx: 1, sy: 1, rot: 0, color: col };
  }

  // Shared select/transform entry for both Select and Stamp tools.
  // Returns true if a gesture was started (handle, or an existing object hit).
  function handleSelectDown(pos, w, allowPlace) {
    if (state.selectedId) {
      var hid = hitHandle(pos.x, pos.y);
      if (hid) {
        var o = byId(state.selectedId); pushHistory();
        if (hid === 'rot') {
          active = { mode: 'rotate', obj: o, cx: o.x, cy: o.y, startRot: o.rot || 0, startAngle: Math.atan2(w.y - o.y, w.x - o.x) };
        } else if (o.type === 'stamp') {
          active = { mode: 'transform', stamp: true, obj: o, handle: hid, startCenter: { x: o.x, y: o.y }, startRot: o.rot || 0, startHalf: stampHalf(o) };
        } else {
          active = { mode: 'transform', stamp: false, obj: o, handle: hid, startAABB: getAABB(o), origJSON: JSON.stringify(o) };
        }
        return true;
      }
    }
    var hit = hitTest(w.x, w.y);
    if (hit) { state.selectedId = hit.id; pushHistory(); active = { mode: 'move', obj: hit, startW: w, origJSON: JSON.stringify(hit) }; return true; }
    if (allowPlace) return false;
    state.selectedId = null; return false;
  }

  function pointerMove(e) {
    if (active && active.mode === 'pinch') { movePinch(e); return; }
    if (!active) return;
    e.preventDefault();
    var pos = eventPos(e);
    var w = toWorld(pos.x, pos.y);

    if (active.mode === 'pan') {
      state.view.x = active.ox + (pos.x - active.sx); state.view.y = active.oy + (pos.y - active.sy);
      render(); return;
    }
    if (active.mode === 'draw') {
      if (active.locked) return;                 // already snapped to a shape
      active.obj.points.push(w);
      if (Math.hypot(pos.x - active.lastScreen.x, pos.y - active.lastScreen.y) > MOVE_EPS) {
        active.lastScreen = pos; scheduleHold();  // movement -> re-arm hold timer
      }
      render(); return;
    }
    if (active.mode === 'erase') { var hit = hitTest(w.x, w.y); if (hit) { removeObject(hit.id); render(); } return; }
    if (active.mode === 'brush') {
      // place a stitch every `spacing` world-units along the drag path
      var spacing = Math.max(6, state.size * state.settings.brushSpacing);
      var lp = brush.last, dx = w.x - lp.x, dy = w.y - lp.y, segLen = Math.hypot(dx, dy);
      if (segLen > 0) {
        var ux = dx / segLen, uy = dy / segLen, traveled = 0, remaining = spacing - brush.dAccum;
        while (traveled + remaining <= segLen) {
          traveled += remaining;
          state.objects.push(makeBrushStamp({ x: lp.x + ux * traveled, y: lp.y + uy * traveled }));
          brush.dAccum = 0; remaining = spacing;
        }
        brush.dAccum += (segLen - traveled);
        brush.last = { x: w.x, y: w.y };
        render();
      }
      return;
    }
    if (active.mode === 'place') {
      // dragging while first placing a stitch: default sets DIRECTION; with the
      // length setting on, it stretches the stitch out from the click point.
      var o = active.obj, a = active.anchor;
      var vx = w.x - a.x, vy = w.y - a.y, d = Math.hypot(vx, vy);
      if (d < 6) { o.rot = 0; o.sy = 1; o.x = a.x; o.y = a.y; }
      else {
        o.rot = Math.atan2(vy, vx) + Math.PI / 2;   // top of stitch points along the drag
        if (state.settings.lengthOnDrag) {
          o.sy = Math.max(0.4, Math.min(8, d / (1.2 * o.size)));  // length follows drag distance
          o.x = a.x + vx / 2; o.y = a.y + vy / 2;                 // base stays at the click point
        } else {
          o.sy = 1; o.x = a.x; o.y = a.y;                         // direction only, fixed length
        }
      }
      render(); return;
    }
    if (active.mode === 'move') {
      var clone = JSON.parse(active.origJSON);
      translateObj(clone, w.x - active.startW.x, w.y - active.startW.y);
      assignGeom(active.obj, clone);
      render(); return;
    }
    if (active.mode === 'rotate') { applyRotate(w); render(); return; }
    if (active.mode === 'transform') { active.stamp ? applyStampTransform(w) : applyTransform(w); render(); return; }
  }

  function pointerUp() {
    if (active && active.mode === 'draw') clearTimeout(active.holdTimer);
    if (active && /draw|move|erase|transform|place|rotate|brush/.test(active.mode)) save();
    active = null; brush = null;
  }

  // ---- draw-and-hold snap
  function scheduleHold() {
    if (!active) return;
    clearTimeout(active.holdTimer);
    active.holdTimer = setTimeout(tryConform, HOLD_MS);
  }
  function tryConform() {
    if (!active || active.mode !== 'draw' || active.locked) return;
    var shape = recognizeShape(active.obj.points);
    if (!shape) return;
    shape.id = active.obj.id; shape.color = active.obj.color; shape.width = active.obj.width;
    var i = state.objects.indexOf(active.obj);
    if (i >= 0) state.objects[i] = shape;
    active.obj = shape; active.locked = true;
    state.selectedId = shape.id;
    render(); save();
    flash('Snapped to ' + shape.kind + '  ✓');
  }

  // ---- transform handle math
  function applyTransform(w) {
    var b = active.startAABB, L = b.x, T = b.y, R = b.x + b.w, B = b.y + b.h;
    var hid = active.handle, ax = L, ay = T, fx = 1, fy = 1;
    var wsafe = b.w || 1, hsafe = b.h || 1;
    if (hid.indexOf('e') >= 0) { ax = L; fx = (w.x - L) / wsafe; }
    if (hid.indexOf('w') >= 0) { ax = R; fx = (R - w.x) / wsafe; }
    if (hid.indexOf('s') >= 0) { ay = T; fy = (w.y - T) / hsafe; }
    if (hid.indexOf('n') >= 0) { ay = B; fy = (B - w.y) / hsafe; }
    fx = clampFactor(fx); fy = clampFactor(fy);
    var clone = JSON.parse(active.origJSON);
    scaleObj(clone, ax, ay, fx, fy);
    assignGeom(active.obj, clone);
  }
  function clampFactor(f) { if (!isFinite(f)) return 1; return Math.max(0.06, Math.abs(f)); }

  // rotate the selected object about its center; snap to 15° when close
  function applyRotate(w) {
    var cur = Math.atan2(w.y - active.cy, w.x - active.cx);
    var ang = active.startRot + (cur - active.startAngle);
    var step = Math.PI / 12, sn = Math.round(ang / step) * step;
    if (Math.abs(sn - ang) < 4 * Math.PI / 180) ang = sn;
    active.obj.rot = ang;
  }

  // stretch a stamp within its own rotated local axes (keeps the opposite
  // local edge anchored; updates sx/sy and re-centers in world space)
  function applyStampTransform(w) {
    var o = active.obj, h = active.startHalf;
    var lp = rotv(w.x - active.startCenter.x, w.y - active.startCenter.y, -active.startRot);
    var L = -h.hx, R = h.hx, T = -h.hy, B = h.hy, wsafe = 2 * h.hx || 1, hsafe = 2 * h.hy || 1;
    var hid = active.handle, ax = 0, ay = 0, fx = 1, fy = 1;
    if (hid.indexOf('e') >= 0) { ax = L; fx = (lp.x - L) / wsafe; }
    if (hid.indexOf('w') >= 0) { ax = R; fx = (R - lp.x) / wsafe; }
    if (hid.indexOf('s') >= 0) { ay = T; fy = (lp.y - T) / hsafe; }
    if (hid.indexOf('n') >= 0) { ay = B; fy = (B - lp.y) / hsafe; }
    fx = clampFactor(fx); fy = clampFactor(fy);
    var Lp = ax + (L - ax) * fx, Rp = ax + (R - ax) * fx, Tp = ay + (T - ay) * fy, Bp = ay + (B - ay) * fy;
    o.sx = (Math.abs(Rp - Lp) / 2) / (o.size * 0.6);
    o.sy = (Math.abs(Bp - Tp) / 2) / (o.size * 0.6);
    var wc = rotv((Lp + Rp) / 2, (Tp + Bp) / 2, active.startRot);
    o.x = active.startCenter.x + wc.x; o.y = active.startCenter.y + wc.y;
  }

  // copy geometry fields from src into dst (same id/type)
  function assignGeom(dst, src) { for (var k in src) if (src.hasOwnProperty(k)) dst[k] = src[k]; }

  // ---- pinch zoom + two-finger pan
  function dist(t1, t2) { return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); }
  function mid(t1, t2, r) { return { x: (t1.clientX + t2.clientX) / 2 - r.left, y: (t1.clientY + t2.clientY) / 2 - r.top }; }
  function startPinch(e) {
    var r = canvas.getBoundingClientRect();
    active = { mode: 'pinch', d0: dist(e.touches[0], e.touches[1]), m0: mid(e.touches[0], e.touches[1], r), scale0: state.view.scale, vx0: state.view.x, vy0: state.view.y };
  }
  function movePinch(e) {
    if (!e.touches || e.touches.length < 2) return;
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    var d = dist(e.touches[0], e.touches[1]), m = mid(e.touches[0], e.touches[1], r);
    var newScale = Math.min(5, Math.max(0.25, active.scale0 * (d / active.d0)));
    var wx = (active.m0.x - active.vx0) / active.scale0, wy = (active.m0.y - active.vy0) / active.scale0;
    state.view.scale = newScale; state.view.x = m.x - wx * newScale; state.view.y = m.y - wy * newScale;
    render();
  }

  // -------------------------------------------------------- scene helpers
  function removeObject(id) { state.objects = state.objects.filter(function (o) { return o.id !== id; }); if (state.selectedId === id) state.selectedId = null; }

  // ----------------------------------------------------------- history
  function snapshot() { return JSON.stringify({ objects: state.objects, customSymbols: state.customSymbols }); }
  function pushHistory() { history.push(snapshot()); if (history.length > 80) history.shift(); future.length = 0; }
  function undo() { if (!history.length) return; future.push(snapshot()); applySnapshot(history.pop()); render(); save(); }
  function redo() { if (!future.length) return; history.push(snapshot()); applySnapshot(future.pop()); render(); save(); }
  function applySnapshot(json) { var d = JSON.parse(json); state.objects = d.objects; state.customSymbols = d.customSymbols || state.customSymbols; state.selectedId = null; renderKey(); }

  // ----------------------------------------------------------- timelapse
  // Reveal the pattern stitch-by-stitch, from the Begin marker to the End
  // marker (creation order in between). Each stitch fades in as it appears.
  function playProgress() {
    var f = (performance.now() - playback.startTime) / playback.perStitch;
    var full = Math.floor(f);
    return { full: full, frac: Math.min(1, f - full) };
  }
  function buildPlayOrder() {
    var objs = state.objects, beginId = null, endId = null, i;
    for (i = 0; i < objs.length; i++) if (objs[i].type === 'stamp' && objs[i].symbolId === 'begin') { beginId = objs[i].id; break; }
    for (i = objs.length - 1; i >= 0; i--) if (objs[i].type === 'stamp' && objs[i].symbolId === 'end') { endId = objs[i].id; break; }
    var order = [];
    if (beginId) order.push(beginId);
    objs.forEach(function (o) { if (o.id !== beginId && o.id !== endId) order.push(o.id); });
    if (endId) order.push(endId);
    return order;
  }
  function playTimelapse() {
    if (playback.active) { stopPlayback(); return; }
    var order = buildPlayOrder();
    if (!order.length) { flash('Place some stitches first'); return; }
    state.selectedId = null;
    playback.order = order; playback.pos = {};
    order.forEach(function (id, i) { playback.pos[id] = i; });
    playback.perStitch = Math.max(140, Math.min(520, Math.round(4200 / order.length)));
    playback.startTime = performance.now();
    playback.active = true;
    reflectPlayButton();
    flash('Playing timelapse…  tap the canvas to stop');
    playLoop();
  }
  function playLoop() {
    if (!playback.active) return;
    render();
    if (performance.now() - playback.startTime >= playback.order.length * playback.perStitch + 500) { stopPlayback(); return; }
    playback.raf = requestAnimationFrame(playLoop);
  }
  function stopPlayback() {
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback.active = false; playback.raf = 0;
    reflectPlayButton(); render();
  }
  function reflectPlayButton() {
    var b = document.getElementById('playBtn'); if (!b) return;
    b.textContent = playback.active ? '⏹' : '▶';
    b.classList.toggle('active', playback.active);
  }

  // ----------------------------------------------------------- persistence
  var SAVE_KEY = 'crochet-studio-v1';
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ objects: state.objects, customSymbols: state.customSymbols, startSteps: state.startSteps, endSteps: state.endSteps, view: state.view, settings: state.settings }));
    } catch (err) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY); if (!raw) return;
      var d = JSON.parse(raw);
      state.objects = d.objects || []; state.customSymbols = d.customSymbols || [];
      state.startSteps = d.startSteps || ''; state.endSteps = d.endSteps || '';
      if (d.view) state.view = d.view;
      if (d.settings) state.settings = Object.assign({ lengthOnDrag: false, brushSpacing: 1.1 }, d.settings);
      document.getElementById('startSteps').value = state.startSteps;
      document.getElementById('endSteps').value = state.endSteps;
      var sl = document.getElementById('setLength'); if (sl) sl.checked = !!state.settings.lengthOnDrag;
      reflectSpacing();
    } catch (err) {}
  }

  // ---------------------------------------------------------------- the Key
  function makeThumb(drawFn, color) {
    var c = document.createElement('canvas'); c.width = 68; c.height = 68;
    var cx = c.getContext('2d'); cx.translate(34, 34);
    var ink = color || '#4a3b34';
    cx.strokeStyle = ink; cx.fillStyle = ink; cx.lineWidth = 2.4; cx.lineCap = 'round'; cx.lineJoin = 'round';
    drawFn(cx, 46); return c;
  }
  function keyItem(opts) {
    var div = document.createElement('div');
    div.className = 'key-item' + (state.activeSymbolId === opts.id ? ' active' : '');
    div.dataset.id = opts.id;
    div.appendChild(makeThumb(opts.drawFn, opts.color));
    var labels = document.createElement('div'); labels.className = 'labels'; labels.innerHTML = '<b></b><span></span>';
    labels.querySelector('b').textContent = opts.label; labels.querySelector('span').textContent = opts.abbr || '';
    div.appendChild(labels);
    if (opts.deletable) {
      var del = document.createElement('button'); del.className = 'del'; del.textContent = '×'; del.title = 'Remove icon';
      del.addEventListener('click', function (ev) { ev.stopPropagation(); state.customSymbols = state.customSymbols.filter(function (s) { return s.id !== opts.id; }); renderKey(); save(); });
      div.appendChild(del);
    }
    div.addEventListener('click', function () {
      state.activeSymbolId = opts.id; state.tool = 'stamp'; reflectTool(); renderKey();
      flash('“' + opts.label + '” selected — tap the canvas to place it');
    });
    return div;
  }
  function renderKey() {
    var stitchList = document.getElementById('stitchList'), markerList = document.getElementById('markerList'), customList = document.getElementById('customList');
    stitchList.innerHTML = ''; markerList.innerHTML = ''; customList.innerHTML = '';
    CrochetSymbols.list.forEach(function (sym) {
      var item = keyItem({ id: sym.id, label: sym.label, abbr: sym.abbr, drawFn: sym.draw, color: sym.color });
      (sym.isMarker ? markerList : stitchList).appendChild(item);
    });
    state.customSymbols.forEach(function (sym) {
      customList.appendChild(keyItem({ id: sym.id, label: sym.label, abbr: sym.abbr, deletable: true, drawFn: function (cx, size) { drawCustomStrokes(cx, sym, size); } }));
    });
  }

  // ------------------------------------------------- custom icon creator
  var iconPad = document.getElementById('iconPad'), iconCtx = iconPad.getContext('2d');
  var iconStrokes = [], iconDrawing = null;
  function clearIconPad() { iconStrokes = []; iconCtx.clearRect(0, 0, 240, 240); }
  function renderIconPad() {
    iconCtx.clearRect(0, 0, 240, 240); iconCtx.strokeStyle = '#4a3b34'; iconCtx.lineWidth = 4; iconCtx.lineCap = 'round'; iconCtx.lineJoin = 'round';
    iconStrokes.forEach(function (s) { iconCtx.beginPath(); s.forEach(function (p, i) { i ? iconCtx.lineTo(p.x, p.y) : iconCtx.moveTo(p.x, p.y); }); iconCtx.stroke(); });
  }
  function iconPadPos(e) { var r = iconPad.getBoundingClientRect(); var t = (e.touches && e.touches[0]) || e; return { x: (t.clientX - r.left) * (240 / r.width), y: (t.clientY - r.top) * (240 / r.height) }; }
  iconPad.addEventListener('pointerdown', function (e) { e.preventDefault(); iconDrawing = [iconPadPos(e)]; iconStrokes.push(iconDrawing); });
  iconPad.addEventListener('pointermove', function (e) { if (!iconDrawing) return; e.preventDefault(); iconDrawing.push(iconPadPos(e)); renderIconPad(); });
  window.addEventListener('pointerup', function () { iconDrawing = null; });
  function openIconModal() { clearIconPad(); document.getElementById('iconLabel').value = ''; document.getElementById('iconAbbr').value = ''; document.getElementById('iconModal').classList.add('show'); }
  function closeIconModal() { document.getElementById('iconModal').classList.remove('show'); }
  function saveCustomIcon() {
    if (!iconStrokes.length) { flash('Sketch something first ✎'); return; }
    var label = document.getElementById('iconLabel').value.trim() || 'My Icon';
    var abbr = document.getElementById('iconAbbr').value.trim();
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    iconStrokes.forEach(function (s) { s.forEach(function (p) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }); });
    var span = Math.max(maxx - minx, maxy - miny) || 1, cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    var norm = iconStrokes.map(function (s) { return s.map(function (p) { return { x: (p.x - cx) / span, y: (p.y - cy) / span }; }); });
    state.customSymbols.push({ id: 'cust_' + uid(), label: label, abbr: abbr, strokes: norm });
    renderKey(); save(); closeIconModal(); flash('“' + label + '” added to your key');
  }

  // -------------------------------------------------------------- export
  function exportPNG() {
    var pad = 60, b = contentBounds();
    var W = Math.max(400, b.w + pad * 2), H = Math.max(300, b.h + pad * 2);
    var legendH = (state.startSteps || state.endSteps) ? 150 : 0;
    var ec = document.createElement('canvas'); ec.width = W * 2; ec.height = (H + legendH) * 2;
    var ex = ec.getContext('2d'); ex.scale(2, 2);
    ex.fillStyle = '#fbf7f1'; ex.fillRect(0, 0, W, H + legendH);
    ex.fillStyle = '#5b4a42'; ex.font = '600 22px Georgia, serif'; ex.fillText('Crochet Pattern', pad, 34);
    ex.save(); ex.translate(pad - b.x, pad - b.y + 24);
    state.objects.forEach(function (o) { drawObject(ex, o); });
    ex.restore();
    if (legendH) {
      var fy = H + 6;
      ex.fillStyle = '#fff'; ex.fillRect(20, fy, W - 40, legendH - 26); ex.strokeStyle = '#e7ddd2'; ex.strokeRect(20, fy, W - 40, legendH - 26);
      ex.fillStyle = '#b6727e'; ex.font = '600 12px sans-serif'; ex.fillText('STARTING STITCHES', 34, fy + 22); ex.fillText('ENDING STITCHES', 34, fy + 78);
      ex.fillStyle = '#4a3b34'; ex.font = '13px sans-serif';
      wrapText(ex, state.startSteps || '—', 34, fy + 40, W - 70, 16); wrapText(ex, state.endSteps || '—', 34, fy + 96, W - 70, 16);
    }
    var a = document.createElement('a'); a.href = ec.toDataURL('image/png'); a.download = 'crochet-pattern.png'; a.click();
    flash('Exported crochet-pattern.png');
  }
  function contentBounds() {
    if (!state.objects.length) return { x: 0, y: 0, w: 400, h: 300 };
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    state.objects.forEach(function (o) { var b = getAABB(o); minx = Math.min(minx, b.x); miny = Math.min(miny, b.y); maxx = Math.max(maxx, b.x + b.w); maxy = Math.max(maxy, b.y + b.h); });
    return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
  }
  function wrapText(g, text, x, y, maxW, lh) {
    var words = String(text).split(/\s+/), line = '', yy = y;
    for (var n = 0; n < words.length; n++) { var test = line + words[n] + ' '; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = words[n] + ' '; yy += lh; } else line = test; }
    g.fillText(line, x, yy);
  }

  // ----------------------------------------------------------------- UI wiring
  function reflectTool() { document.querySelectorAll('#toolGroup .tool').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === state.tool); }); }
  function reflectSpacing() {
    var ss = document.getElementById('setSpacing'), sv = document.getElementById('spacingVal');
    var v = state.settings.brushSpacing || 1.1;
    if (ss) ss.value = v;
    if (sv) sv.textContent = (+v).toFixed(1) + '×';
  }
  function flash(msg) { var h = document.getElementById('hint'); h.textContent = msg; h.classList.add('show'); clearTimeout(flash._t); flash._t = setTimeout(function () { h.classList.remove('show'); }, 1800); }
  function buildSwatches() {
    var wrap = document.getElementById('swatches');
    COLORS.forEach(function (c, i) {
      var b = document.createElement('button'); b.className = 'swatch' + (i === 0 ? ' active' : ''); b.style.background = c; b.dataset.color = c;
      b.addEventListener('click', function () { state.color = c; document.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('active'); }); b.classList.add('active'); });
      wrap.appendChild(b);
    });
  }
  function wireUI() {
    document.querySelectorAll('#toolGroup .tool').forEach(function (b) { b.addEventListener('click', function () { state.tool = b.dataset.tool; if (state.tool !== 'select' && state.tool !== 'stamp') state.selectedId = null; reflectTool(); render(); }); });
    document.querySelectorAll('.size-btn').forEach(function (b) { b.addEventListener('click', function () { state.size = +b.dataset.size; document.querySelectorAll('.size-btn').forEach(function (s) { s.classList.remove('active'); }); b.classList.add('active'); }); });
    document.getElementById('playBtn').addEventListener('click', playTimelapse);
    document.getElementById('undo').addEventListener('click', undo);
    document.getElementById('redo').addEventListener('click', redo);
    document.getElementById('clearBtn').addEventListener('click', function () { if (state.objects.length && confirm('Clear the whole canvas?')) { pushHistory(); state.objects = []; state.selectedId = null; render(); save(); } });
    document.getElementById('exportBtn').addEventListener('click', exportPNG);
    document.getElementById('zoomReset').addEventListener('click', function () { state.view = { x: 0, y: 0, scale: 1 }; render(); });
    document.getElementById('addIconBtn').addEventListener('click', openIconModal);
    document.getElementById('iconCancel').addEventListener('click', closeIconModal);
    document.getElementById('iconSave').addEventListener('click', saveCustomIcon);
    document.getElementById('iconClearPad').addEventListener('click', clearIconPad);
    document.getElementById('iconModal').addEventListener('click', function (e) { if (e.target === this) closeIconModal(); });
    var settingsBtn = document.getElementById('settingsBtn'), settingsPop = document.getElementById('settingsPop');
    settingsBtn.addEventListener('click', function (e) { e.stopPropagation(); settingsPop.hidden = !settingsPop.hidden; });
    document.addEventListener('pointerdown', function (e) { if (!settingsPop.hidden && !settingsPop.contains(e.target) && !settingsBtn.contains(e.target)) settingsPop.hidden = true; });
    var setLength = document.getElementById('setLength');
    setLength.checked = !!state.settings.lengthOnDrag;
    setLength.addEventListener('change', function () { state.settings.lengthOnDrag = this.checked; save(); flash(this.checked ? 'Drag a new stitch to stretch its length' : 'Drag a new stitch to set its direction'); });
    var setSpacing = document.getElementById('setSpacing');
    if (setSpacing) setSpacing.addEventListener('input', function () { state.settings.brushSpacing = +this.value; reflectSpacing(); save(); });
    reflectSpacing();

    document.getElementById('keyToggle').addEventListener('click', function () { document.getElementById('keyPanel').classList.toggle('collapsed'); });
    document.getElementById('stepsToggle').addEventListener('click', function () { document.getElementById('stepsPanel').classList.toggle('collapsed'); });
    document.getElementById('startSteps').addEventListener('input', function () { state.startSteps = this.value; save(); });
    document.getElementById('endSteps').addEventListener('input', function () { state.endSteps = this.value; save(); });

    window.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      var map = { s: 'stamp', b: 'brush', d: 'draw', e: 'erase', v: 'select', h: 'pan' };
      if (map[e.key]) { state.tool = map[e.key]; if (state.tool !== 'select' && state.tool !== 'stamp') state.selectedId = null; reflectTool(); render(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) { pushHistory(); removeObject(state.selectedId); render(); save(); }
    });

    canvas.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    workspace.addEventListener('touchstart', function (e) { if (e.touches.length === 2) startPinch(e); }, { passive: false });
    workspace.addEventListener('touchmove', function (e) { if (active && active.mode === 'pinch') movePinch(e); }, { passive: false });
    window.addEventListener('resize', resize);
  }

  // ------------------------------------------------------------------ boot
  function init() {
    buildSwatches(); wireUI(); load(); renderKey(); reflectTool(); resize();
    flash('Draw a shape and hold to snap it · Select to stretch icons');
  }
  init();

  // debug hook (harmless): inspect recognizer/state from the console
  window.__cps = { recognizeShape: recognizeShape, state: state, playback: playback, render: render };
})();
