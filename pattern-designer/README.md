# Crochet Pattern Studio

A web app for designing visual crochet patterns — built to run on iPad (Apple Pencil),
but works on any desktop browser too. No build step: it's plain HTML/CSS/JS.

## Run it

**On Windows (this machine):**
```
cd crochet-pattern-app
python -m http.server 5050
```
then open http://localhost:5050

You can also just double-click `index.html` — though running a local server is
recommended so localStorage autosave works reliably.

**On your iPad (same Wi-Fi):**
1. Find this PC's local IP (run `ipconfig`, look for IPv4, e.g. `192.168.1.20`).
2. On the iPad, open Safari to `http://192.168.1.20:5050`.
3. Tap Share → **Add to Home Screen** to install it like an app (full-screen, offline-capable via the manifest).

## What it does

- **Stamp** stitches from the **Key** onto the canvas — tap a stitch, then tap to place.
  All symbols from the "Crochet Symbols for Beginners" sheet are included (ch, sc, hdc,
  dc, tr, dtr, trtr, htr, puff, popcorn, bobble, cluster, shell, V/W, posts, inc/dec,
  magic ring, etc.).
- **Draw** freeform lines and shapes with the pen. **Draw-and-hold to snap:** sketch a
  rough shape and then *hold still* (pencil/finger down) for about half a second — it
  conforms to a clean **line, ellipse/circle, rectangle/square, or triangle**, just like
  Apple Freeform. Lines also snap to 0/45/90°. Lift quickly and it stays freeform.
- **Erase**, and **Pan**. Two-finger pinch to zoom.
- **Transform / stretch / rotate:** tap a stitch to get a bounding box with 8 handles plus
  a **rotation grip**. Drag a **corner** to scale both axes, an **edge** to **stretch** one
  axis, or the grip to **rotate** (snaps to 15°). Stitch icons keep a **uniform, crisp
  stroke** when stretched (the geometry stretches, the line weight doesn't). Works on stitch
  icons including your own custom ones. Drag the body to move; Delete/Backspace removes.
- **Tap-to-select:** placing a stitch auto-selects it so you can immediately stretch/rotate
  it. Tapping an existing stitch (even with the Stamp tool) selects it instead of placing a
  duplicate — so you rarely need to switch to the Select tool. (Tip: tap empty space to
  place a new stitch.)
- **Place-drag direction / length:** when you first click a stitch onto the canvas, *dragging*
  sets its **direction** by default — the stitch rotates to point where you drag. Open the
  **⚙ Settings** popover and turn on **"Stretch length on drag"** to instead **lengthen** the
  stitch as you drag out from the click point (thickness stays the same). A quick tap with no
  drag just drops a normal upright stitch.
- **Markers:** a **green Begin triangle**, a **red End octagon** (stop-sign), and a
  Direction arrow — for marking where a round/row starts and ends. Markers keep their fixed
  color regardless of the current ink.
- **Timelapse playback (▶):** the play button in the toolbar builds the pattern stitch by
  stitch, starting at the **Begin** marker and finishing at the **End** marker (everything
  in between plays in the order you placed it), each stitch fading in. Tap the canvas (or the
  ⏹ button) to stop. Great for previewing the construction order of a chart.
- **Pattern Steps** panel (bottom-right) for written starting/ending stitch instructions;
  these are included in the export.
- **My Icons** — draw your own symbol, give it a **label + abbreviation**, and it's added
  to your personal key, ready to stamp.
- **Color** swatches and **size** (S/M/L) for stitches and lines.
- **Undo/redo**, autosave to the browser, and **Export** to PNG (with your steps printed
  underneath).

## Project layout

```
index.html              # app shell + toolbar/panels markup
css/styles.css          # warm paper theme, iPad-tuned layout
js/symbols.js           # vector definitions for every stitch symbol
js/app.js               # canvas engine: tools, the Key, custom icons, export, autosave
manifest.webmanifest    # makes it installable to the iPad home screen
```

## Notes / next steps

- This is a prototype. Natural next additions: **rotation handles** (a rotate grip above
  the box), a true vector (SVG/PDF) export, multi-page patterns, a stitch-count tally, and
  a snap-to-grid mode.
- Tuning knobs in `js/app.js`: `HOLD_MS` (hold duration to snap, default 400ms) and the
  recognizer thresholds in `recognizeShape` / `isRound` (roundness cutoff 0.07).
- Uniform-stroke stretching is done by `scaledCtx()`, a Proxy that scales a symbol's drawing
  coordinates by (sx,sy) while leaving `lineWidth` constant. Rotation lives on each stamp as
  `rot`; the selection box for stamps is drawn in the icon's rotated local frame.
- When you get a Mac mini, the same model (scene graph of stamps + strokes, a symbol
  registry, a customizable key) ports directly to a SwiftUI + PencilKit native app.
