/* symbols.js
 * Vector definitions for crochet stitch symbols, drawn on a 2D canvas.
 *
 * Each draw function receives (ctx, s) where `s` is the symbol size in px.
 * Drawing is centered on the origin (0,0); callers translate/rotate/scale
 * before calling. Strokes use the current ctx.strokeStyle / lineWidth so a
 * stitch inherits the user's chosen ink color.
 *
 * The geometry mirrors the "Crochet Symbols for Beginners" reference sheet.
 */
(function (global) {
  'use strict';

  // ---- low-level helpers (all in centered, size-normalized space) --------

  function vbar(ctx, s) {
    // vertical post
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.lineTo(0, s * 0.5);
    ctx.stroke();
  }

  function topBar(ctx, s) {
    // small horizontal cap across the top of a post (hdc and taller)
    ctx.beginPath();
    ctx.moveTo(-s * 0.22, -s * 0.5);
    ctx.lineTo(s * 0.22, -s * 0.5);
    ctx.stroke();
  }

  function slashes(ctx, s, count) {
    // `count` diagonal slashes crossing the post, stacked top-to-bottom
    var topY = -s * 0.34;
    var gap = (s * 0.68) / (count + 1);
    for (var i = 1; i <= count; i++) {
      var y = topY + gap * i;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, y + s * 0.09);
      ctx.lineTo(s * 0.18, y - s * 0.09);
      ctx.stroke();
    }
  }

  function ellipse(ctx, s, rx, ry, fill) {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    if (fill) ctx.fill();
    else ctx.stroke();
  }

  // A tall post with a top cap and N slashes — the hdc/dc/tr/dtr/trtr family.
  function post(slashCount, capped) {
    return function (ctx, s) {
      vbar(ctx, s);
      if (capped) topBar(ctx, s);
      if (slashCount > 0) slashes(ctx, s, slashCount);
    };
  }

  // ---- symbol registry ---------------------------------------------------
  // id, label, abbr, and a draw(ctx, size) function.

  var SYMBOLS = [
    {
      id: 'ch', label: 'Chain', abbr: 'ch',
      draw: function (ctx, s) { ellipse(ctx, s, s * 0.42, s * 0.2, false); }
    },
    {
      id: 'slst', label: 'Slip Stitch', abbr: 'sl st',
      draw: function (ctx, s) { ellipse(ctx, s, s * 0.16, s * 0.16, true); }
    },
    {
      id: 'sc', label: 'Single Crochet', abbr: 'sc',
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.4); ctx.lineTo(0, s * 0.4);
        ctx.moveTo(-s * 0.4, 0); ctx.lineTo(s * 0.4, 0);
        ctx.stroke();
      }
    },
    {
      id: 'hdc', label: 'Half Double Crochet', abbr: 'hdc',
      draw: post(0, true)
    },
    {
      id: 'dc', label: 'Double Crochet', abbr: 'dc',
      draw: post(1, true)
    },
    {
      id: 'tr', label: 'Treble Crochet', abbr: 'tr',
      draw: post(2, true)
    },
    {
      id: 'dtr', label: 'Double Treble', abbr: 'dtr',
      draw: post(3, true)
    },
    {
      id: 'trtr', label: 'Triple Treble', abbr: 'trtr',
      draw: post(4, true)
    },
    {
      id: 'htr', label: 'Half Treble', abbr: 'htr',
      draw: function (ctx, s) { vbar(ctx, s); slashes(ctx, s, 1); /* no cap */ }
    },
    {
      id: 'yo', label: 'Yarn Over', abbr: 'yo',
      draw: function (ctx, s) { ellipse(ctx, s, s * 0.42, s * 0.22, false); }
    },
    {
      id: 'puff', label: 'Puff Stitch', abbr: 'puff',
      draw: function (ctx, s) {
        // vertical bundle of posts inside an open oval
        ctx.beginPath();
        ctx.moveTo(-s * 0.12, -s * 0.42); ctx.lineTo(-s * 0.12, s * 0.42);
        ctx.moveTo(0, -s * 0.42); ctx.lineTo(0, s * 0.42);
        ctx.moveTo(s * 0.12, -s * 0.42); ctx.lineTo(s * 0.12, s * 0.42);
        ctx.stroke();
        ellipse(ctx, s, s * 0.3, s * 0.42, false);
      }
    },
    {
      id: 'pc', label: 'Popcorn Stitch', abbr: 'pc',
      draw: function (ctx, s) {
        ellipse(ctx, s, s * 0.34, s * 0.42, false);
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.42); ctx.lineTo(0, s * 0.42);
        ctx.stroke();
      }
    },
    {
      id: 'bb', label: 'Bobble Stitch', abbr: 'bb',
      draw: function (ctx, s) {
        // stacked loops over a base
        ellipse(ctx, s, s * 0.18, s * 0.14, false);
        ctx.save(); ctx.translate(0, -s * 0.18);
        ellipse(ctx, s, s * 0.22, s * 0.16, false); ctx.restore();
        ctx.save(); ctx.translate(0, s * 0.16);
        ellipse(ctx, s, s * 0.2, s * 0.15, false); ctx.restore();
      }
    },
    {
      id: 'cl', label: 'Cluster Stitch', abbr: 'cl',
      draw: function (ctx, s) {
        // three posts converging to a single base point
        var top = -s * 0.4, baseY = s * 0.4;
        [-s * 0.28, 0, s * 0.28].forEach(function (x) {
          ctx.beginPath();
          ctx.moveTo(x, top); ctx.lineTo(0, baseY); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - s * 0.1, top); ctx.lineTo(x + s * 0.1, top); ctx.stroke();
        });
      }
    },
    {
      id: 'sh', label: 'Shell Stitch', abbr: 'sh',
      draw: function (ctx, s) {
        // fan of posts from one base point
        var baseY = s * 0.42;
        [-s * 0.36, -s * 0.18, 0, s * 0.18, s * 0.36].forEach(function (x) {
          ctx.beginPath();
          ctx.moveTo(x, -s * 0.4); ctx.lineTo(0, baseY); ctx.stroke();
        });
      }
    },
    {
      id: 'vst', label: 'V Stitch', abbr: 'V-st',
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.34, -s * 0.4); ctx.lineTo(0, s * 0.4);
        ctx.lineTo(s * 0.34, -s * 0.4);
        ctx.stroke();
      }
    },
    {
      id: 'wst', label: 'W Stitch', abbr: 'W-st',
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.42, -s * 0.4); ctx.lineTo(-s * 0.18, s * 0.4);
        ctx.lineTo(0, -s * 0.4); ctx.lineTo(s * 0.18, s * 0.4);
        ctx.lineTo(s * 0.42, -s * 0.4);
        ctx.stroke();
      }
    },
    {
      id: 'spike', label: 'Spike Stitch', abbr: 'sp',
      draw: function (ctx, s) {
        vbar(ctx, s); topBar(ctx, s);
        // long diagonal spike to the base
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.1); ctx.lineTo(s * 0.34, s * 0.5);
        ctx.stroke();
      }
    },
    {
      id: 'fpdc', label: 'Front Post DC', abbr: 'FPdc',
      draw: function (ctx, s) { post(1, true)(ctx, s); hookFoot(ctx, s, 1); }
    },
    {
      id: 'bpdc', label: 'Back Post DC', abbr: 'BPdc',
      draw: function (ctx, s) { post(1, true)(ctx, s); hookFoot(ctx, s, -1); }
    },
    {
      id: 'inc', label: 'Increase', abbr: 'inc',
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, s * 0.4); ctx.lineTo(0, -s * 0.4);
        ctx.lineTo(s * 0.3, s * 0.4);
        ctx.stroke();
      }
    },
    {
      id: 'dec', label: 'Decrease', abbr: 'dec',
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.4); ctx.lineTo(0, s * 0.4);
        ctx.lineTo(s * 0.3, -s * 0.4);
        ctx.stroke();
      }
    },
    {
      id: 'mr', label: 'Magic Ring', abbr: 'mr',
      draw: function (ctx, s) { ellipse(ctx, s, s * 0.4, s * 0.4, false); }
    },
    {
      id: 'arm', label: 'Adjustable Ring', abbr: 'arm',
      draw: function (ctx, s) {
        ellipse(ctx, s, s * 0.4, s * 0.4, false);
        ellipse(ctx, s, s * 0.28, s * 0.28, false);
      }
    },
    {
      id: 'chsp', label: 'Chain Space', abbr: 'ch sp',
      draw: function (ctx, s) { ellipse(ctx, s, s * 0.42, s * 0.16, false); }
    },
    {
      id: 'sk', label: 'Skip Stitch', abbr: 'sk',
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.arc(0, s * 0.2, s * 0.42, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    },
    {
      id: 'begin', label: 'Begin (start)', abbr: 'begin',
      isMarker: true, color: '#2e9d4f',          // green start triangle
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.4); ctx.lineTo(s * 0.4, 0);
        ctx.lineTo(-s * 0.3, s * 0.4); ctx.closePath();
        ctx.fill();
      }
    },
    {
      id: 'end', label: 'End', abbr: 'end',
      isMarker: true, color: '#d6312b',          // red stop-sign octagon
      draw: function (ctx, s) {
        var r = s * 0.42;
        ctx.beginPath();
        for (var i = 0; i < 8; i++) {
          var a = Math.PI / 8 + i * Math.PI / 4;  // flat-top octagon
          var x = Math.cos(a) * r, y = Math.sin(a) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      }
    },
    {
      id: 'arrow', label: 'Direction', abbr: 'arrow',
      isMarker: true,
      draw: function (ctx, s) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0);
        ctx.moveTo(s * 0.45, 0); ctx.lineTo(s * 0.28, -s * 0.14);
        ctx.moveTo(s * 0.45, 0); ctx.lineTo(s * 0.28, s * 0.14);
        ctx.stroke();
      }
    }
  ];

  // small hook foot used by front/back post stitches; dir +1 front, -1 back
  function hookFoot(ctx, s, dir) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.quadraticCurveTo(dir * s * 0.3, s * 0.5, dir * s * 0.3, s * 0.2);
    ctx.stroke();
  }

  global.CrochetSymbols = {
    list: SYMBOLS,
    byId: function (id) {
      for (var i = 0; i < SYMBOLS.length; i++) {
        if (SYMBOLS[i].id === id) return SYMBOLS[i];
      }
      return null;
    }
  };
})(window);
