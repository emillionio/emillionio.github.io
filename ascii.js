/* ──────────────────────────────────────────────
   Animated celestial ASCII atlas.
   A dense, twinkling star field drawn in ink on
   the paper canvas, with cute cats scattered
   among the stars. Decorative — sits behind all
   content, aria-hidden.
   ────────────────────────────────────────────── */
(function () {
  const el = document.getElementById('sky');
  if (!el) return;
  const trailEl = document.getElementById('trail');

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Brightness ramp for twinkling (blank → faint → bright).
  const RAMP = ' .·+*✦';
  // Sparkle ramp for the cursor trail (faint → bright as it fades in/out).
  const SPARK = ' ·+*✦✷';
  let particles = []; // { x, y, life } in grid cells

  // Grapheme splitter so multi-codepoint / combining-mark cats stay intact.
  const seg = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
  const graph = (s) => seg ? [...seg.segment(s)].map((x) => x.segment) : Array.from(s);

  // ── Cat art ───────────────────────────────────
  // A detailed lounging cat (monospace line art)…
  const BIG_CAT = [
    "                         ,",
    "  ,-.       _,---._ __  / \\",
    " /  )    .-'       `./ /   \\",
    "(  (   ,'            `/    /|",
    " \\  `-\"             \\'\\   / |",
    "  `.              ,  \\ \\ /  |",
    "   /`.          ,'-`----Y   |",
    "  (            ;        |   '",
    "  |  ,-.    ,-'         |  /",
    "  |  | (   |            | /",
    "  )  |  \\  `.___________|/",
    "  `--'   `--'",
  ];
  // …plus a cast of kawaii faces. Trailing spaces give breathing room.
  const KAWAII = [
    "≽^•⩊•^≼  ",
    "=^._.^= ∫  ",
    "(=♡ ᆺ ♡=)  ",
    "ᓚ₍ ^. ̫ .^₎  ",
    "(๑ↀᆺↀ๑)  ",
    "/ᐠ｡ꞈ｡ᐟ✿\\  ",
    "(ﾐⓛᆽⓛﾐ)✧  ",
  ];

  let cols = 0, rows = 0;
  let charW = 8.2, lineH = 16;
  let stars = [];      // { i, phase, speed, peak, blink }
  let cats = [];       // { lines:[graphemes[]], row, col }

  function measure() {
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(50);
    probe.style.cssText =
      'position:absolute;visibility:hidden;white-space:pre;font:' +
      getComputedStyle(el).font;
    document.body.appendChild(probe);
    charW = probe.getBoundingClientRect().width / 50 || 8.2;
    document.body.removeChild(probe);
    const fs = parseFloat(getComputedStyle(el).fontSize) || 13;
    lineH = fs * 1.32;
  }

  function build() {
    measure();
    cols = Math.min(280, Math.ceil(window.innerWidth / charW) + 1);
    rows = Math.min(140, Math.ceil(window.innerHeight / lineH) + 1);

    // Place cats at fractional anchors so they reflow on resize.
    const placements = [
      { lines: BIG_CAT,     fx: 0.84, fy: 0.40 },
      { lines: [KAWAII[0]], fx: 0.12, fy: 0.15 },
      { lines: [KAWAII[5]], fx: 0.48, fy: 0.11 },
      { lines: [KAWAII[4]], fx: 0.10, fy: 0.50 },
      { lines: [KAWAII[1]], fx: 0.30, fy: 0.70 },
      { lines: [KAWAII[2]], fx: 0.60, fy: 0.82 },
      { lines: [KAWAII[3]], fx: 0.88, fy: 0.74 },
      { lines: [KAWAII[6]], fx: 0.70, fy: 0.30 },
    ];

    const reserved = new Array(cols * rows).fill(false);
    cats = [];

    placements.forEach((p) => {
      const lines = p.lines.map(graph);
      const w = Math.max(...lines.map((l) => l.length));
      const col = Math.round(p.fx * cols - w / 2);
      const row = Math.round(p.fy * rows - lines.length / 2);
      cats.push({ lines, row, col });
      // Reserve the cat's footprint (plus a halo) so stars don't crowd it.
      for (let r = -1; r <= lines.length; r++) {
        for (let c = -1; c <= w; c++) {
          const x = col + c, y = row + r;
          if (x >= 0 && x < cols && y >= 0 && y < rows) reserved[y * cols + x] = true;
        }
      }
    });

    // Dense twinkling star field on the remaining cells.
    stars = [];
    const density = 0.12;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        if (reserved[idx]) continue;
        if (Math.random() < density) {
          const b = Math.random();
          stars.push({
            i: idx,
            phase: Math.random() * Math.PI * 2,
            speed: 1.4 + Math.random() * 3.2,
            peak: b < 0.12 ? 5 : (b < 0.45 ? 3 : 2),
            blink: Math.random() < 0.22,
          });
        }
      }
    }
  }

  function overlay(line, col, ins) {
    const g = graph(line);
    if (col < 0) col = 0;
    while (g.length < col + ins.length) g.push(' ');
    for (let k = 0; k < ins.length; k++) g[col + k] = ins[k];
    return g.join('');
  }

  function frame(t) {
    const cells = new Array(cols * rows).fill(' ');
    const time = t * 0.001;
    for (let s = 0; s < stars.length; s++) {
      const star = stars[s];
      const wave = (Math.sin(time * star.speed + star.phase) + 1) / 2;
      let ch;
      if (star.blink) {
        ch = wave > 0.55 ? RAMP[star.peak] : ' ';
      } else {
        let lvl = Math.round(wave * star.peak);
        if (lvl < 0) lvl = 0;
        if (lvl >= RAMP.length) lvl = RAMP.length - 1;
        ch = RAMP[lvl];
      }
      if (ch !== ' ') cells[star.i] = ch;
    }

    const lines = [];
    for (let y = 0; y < rows; y++) {
      lines.push(cells.slice(y * cols, y * cols + cols).join(''));
    }
    // Lay the cats over the stars.
    for (let c = 0; c < cats.length; c++) {
      const cat = cats[c];
      for (let r = 0; r < cat.lines.length; r++) {
        const ry = cat.row + r;
        if (ry < 0 || ry >= rows) continue;
        lines[ry] = overlay(lines[ry], cat.col, cat.lines[r]);
      }
    }
    el.textContent = lines.join('\n');

    // Cursor sparkle trail (separate pink layer).
    if (trailEl) {
      const tg = new Array(cols * rows).fill(' ');
      for (let p = particles.length - 1; p >= 0; p--) {
        const pt = particles[p];
        pt.life -= 0.05; // ~1.3s lifespan at 15fps
        if (pt.life <= 0) { particles.splice(p, 1); continue; }
        if (pt.x >= 0 && pt.x < cols && pt.y >= 0 && pt.y < rows) {
          const lvl = Math.max(1, Math.round(pt.life * (SPARK.length - 1)));
          tg[pt.y * cols + pt.x] = SPARK[lvl];
        }
      }
      let tout = '';
      for (let y = 0; y < rows; y++) tout += tg.slice(y * cols, y * cols + cols).join('') + '\n';
      trailEl.textContent = tout;
    }
  }

  // Spawn sparkles at a grid cell.
  function spawn(col, row) {
    particles.push({ x: col, y: row, life: 1 });
    if (Math.random() < 0.6) {
      particles.push({
        x: col + (Math.random() < 0.5 ? -1 : 1),
        y: row + (Math.random() < 0.5 ? 0 : -1),
        life: 0.55 + Math.random() * 0.35,
      });
    }
    if (particles.length > 90) particles.splice(0, particles.length - 90);
  }

  // ── Lifecycle ──
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { build(); frame(performance.now()); }, 200);
  });

  build();

  // Cursor trail — map pointer position to a grid cell and spawn sparkles.
  if (!reduce && trailEl) {
    let lastSpawn = 0;
    window.addEventListener('mousemove', (e) => {
      const now = performance.now();
      if (now - lastSpawn < 24) return;
      lastSpawn = now;
      const col = Math.floor((e.clientX - 8) / charW);
      const row = Math.floor((e.clientY - 8) / lineH);
      spawn(col, row);
    }, { passive: true });
  }

  if (reduce) { frame(0); return; }

  let last = 0;
  function loop(now) {
    if (visible && !document.hidden && !window.__skyPaused && now - last >= 66) { // ~15fps
      frame(now);
      last = now;
    }
    requestAnimationFrame(loop);
  }
  frame(performance.now());
  requestAnimationFrame(loop);
})();
