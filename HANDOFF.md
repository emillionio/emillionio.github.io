# Emily Rios Portfolio — Handoff & Maintenance Guide

A practical reference for running, editing, and deploying this site. No build tools, no frameworks — just three files you can edit directly.

---

## 1. What this is

A single-page personal portfolio for Emily Rios (UX designer & Python developer), hosted on **GitHub Pages** at the repo `emillionio/emillionio.github.io` (custom domain via `CNAME`).

**Aesthetic:** an "antique celestial atlas on aged paper" — a warm cream canvas with dark-ink editorial typography, soft pink accents, and a live, twinkling ASCII star field (with hidden cats) drifting behind all the content.

---

## 2. Files

| File | What it does |
|------|--------------|
| `index.html` | All page content and structure. The only file with copy/text. |
| `style.css` | All styling — colors, type, layout, animations. |
| `ascii.js` | The animated celestial star field + cats engine. |
| `profile.jpg` | The portrait photo in the About section. |
| `CNAME` | The custom domain config (don't touch unless changing domains). |
| `.nojekyll` | Tells GitHub Pages to serve files as-is. |
| `README.md` | Repo readme. |
| `HANDOFF.md` | This document. |

There is **no `package.json`, no node_modules, no build step.** What you edit is exactly what ships.

---

## 3. Running it locally

You need a local web server (opening `index.html` directly with `file://` works for most of it, but a server is cleaner). From the project folder:

```powershell
cd "C:\Users\riose\OneDrive\Documents\Local\emillionio.github.io"
python -m http.server 3000
```

Then open **http://localhost:3000** in your browser. Press `Ctrl+C` in the terminal to stop it.

> If `python` isn't found, install Python from python.org, or use any static server you like.

---

## 4. Deploying (publishing changes)

GitHub Pages auto-deploys whatever is on the `main` branch. After editing files:

```powershell
cd "C:\Users\riose\OneDrive\Documents\Local\emillionio.github.io"
git add .
git commit -m "Describe what you changed"
git push
```

The live site updates in ~1 minute.

### ⚠️ The caching gotcha (important)

Browsers and GitHub's CDN cache `style.css` and `ascii.js`. After you push a change to either of those, visitors (and you) may still see the **old** version for several minutes. This already bit us once — the star animation looked "broken" because an old `ascii.js` was cached.

**The fix is built in:** at the bottom and top of `index.html`, the asset links carry a version number:

```html
<link rel="stylesheet" href="style.css?v=2">
...
<script src="ascii.js?v=2"></script>
```

**Whenever you edit `style.css` or `ascii.js`, bump that number** (`?v=2` → `?v=3`, both places). That forces every browser to fetch the fresh file. After deploying, a hard refresh (`Ctrl+F5`) clears your own cache.

---

## 5. Design system

All design tokens live as CSS variables at the top of `style.css` under `:root`. Change them there and they update everywhere.

### Colors

| Variable | Value | Use |
|----------|-------|-----|
| `--paper` | `#f4ecdd` | Page background (warm cream) |
| `--ink` | `#2b2620` | Primary text (high contrast) |
| `--ink-soft` | `#5a5246` | Secondary/body text |
| `--ink-faint` | `#8a7f6d` | Metadata, labels |
| `--rose` | `#ffe3ec` | Soft pink — **fills only** (chips, the nav button), never text |
| `--rose-deep` | `#b03d63` | Accessible pink for **text/links** (passes contrast on paper) |
| `--rose-deeper` | `#8f2f50` | Darker pink for hover states |
| `--star` | `rgba(70,56,40,0.5)` | The ASCII star ink |

> **Accessibility note:** `#ffe3ec` is too pale to use as text on the cream background (it fails contrast). That's why there are *two* pinks — the pale one for backgrounds/fills, and `--rose-deep` for anything that's actual text. Keep this split if you adjust colors.

### Typography

Loaded from Google Fonts in `index.html`:

- **Playfair Display** (`--serif`) — display headings, the big "Emily Rios", project titles.
- **Inter** (`--sans`) — body copy.
- **JetBrains Mono** (`--mono`) — labels, nav, buttons, the star field.

### Spacing & layout

- Page max width: `1280px` (`--max`).
- Section vertical padding: `140px` (less on smaller screens).
- Easing curve for all motion: `--ease` (`cubic-bezier(0.16, 1, 0.3, 1)`).

---

## 6. Page structure

`index.html` reads top to bottom as:

1. **Skip link** — accessibility shortcut to content.
2. **`#sky`** — the `<pre>` the star field draws into. Empty in the HTML; filled by `ascii.js`.
3. **`.paper-grain`** — subtle paper texture overlay (pure CSS, no image).
4. **`#nav`** — fixed top nav. Becomes a frosted bar on scroll.
5. **`.hero`** — name, tagline, two buttons.
6. **`#about`** — heading, photo + skills (left column), technical bio (right column).
7. **`#work`** — the three project rows.
8. **`#contact`** — closing headline + email/LinkedIn links.
9. **`.footer`** — tagline + copyright.
10. Two `<script>` blocks — the star field (`ascii.js`) and the small inline script for nav/scroll-reveals.

---

## 7. Common edits (recipes)

### Change the bio
Find `<div class="about-body reveal">` in `index.html`. Edit the `<p>` paragraphs. Wrap any phrase you want emphasized in `<strong>...</strong>`.

### Change the skills
Find `<ul class="skills">`. Each skill is one `<li class="skill">Word</li>`. Add, remove, or rename — keep them short (one word reads best).

### Edit a project
Find `<section id="work">`. Each project is an `<article class="row ...">`. Inside:
- `.row-index` — the `001` number.
- `.row-title` — the project name.
- `.row-detail p` — the description shown on hover.
- `.row-tags` — the little tag pills.

### Add a new project
Copy one whole `<article class="row reveal" ...>...</article>` block, paste it after the last one, and update its text and the `aria-label`. No other changes needed.

### Turn placeholders into real case studies
Right now clicking a project calls `showPlaceholder()` (a popup that says "coming soon"). To link to a real case study instead, change the article's `onclick`/`onkeydown` to navigate, e.g. replace `onclick="showPlaceholder()"` with `onclick="location.href='stitchtracker.html'"` and update the keyboard handler similarly. (You'd then create that page.)

### Change contact info
Find `<section id="contact">`. Update the `href="mailto:..."` and the LinkedIn `href`, plus the visible `.cl-value` text.

### Swap the photo
Replace `profile.jpg` with a new image of the same name (portrait orientation, roughly 4:5 works best). If you use a different filename, update `src="profile.jpg"` in the About section.

### Change a color
Edit the variable in `:root` at the top of `style.css`. Remember to bump the `?v=` number in `index.html` after.

---

## 8. The star field (`ascii.js`)

The whole animated background is one self-contained script. Key things you can safely tune near the top / in the `build()` function:

- **Star density** — the line `const density = 0.12;`. Higher = more stars (e.g. `0.16`). Lower = sparser.
- **Twinkle speed** — in the stars loop, `speed: 1.4 + Math.random() * 3.2`. Bigger numbers = faster shimmer.
- **Frame rate** — the loop's `now - last >= 66` (≈15 fps). Lower the `66` for smoother, higher for calmer/cheaper.
- **The cats** — defined as `BIG_CAT` (the detailed lounging cat) and `KAWAII` (the little faces like `≽^•⩊•^≼`). To add a cat, add a string to `KAWAII` and reference it in the `placements` array inside `build()`. Each placement has `fx`/`fy` (0–1) fractional position on screen.

The script is decorative and `aria-hidden`, so screen readers ignore it. It **pauses automatically** when the browser tab is hidden (saves battery), and it renders a **static** (non-twinkling) frame if the visitor has "reduce motion" turned on in their OS — that's intentional accessibility behavior, not a bug.

> There's a `window.__skyPaused` flag in the loop used during development to freeze the animation for screenshots. Nothing on the live site sets it, so it has no effect in production. You can ignore or delete it.

---

## 9. Animations

- **Hero entrance** — the name, tagline, and buttons rise and fade in on load (pure CSS, in `style.css` under "Motion").
- **Scroll reveals** — section headings and blocks fade up as you scroll to them. Driven by the small inline script in `index.html` (an `IntersectionObserver` that adds the `in-view` class) plus the `.reveal` / `.reveal-clip` / `.reveal-img` CSS classes.

> **Gotcha learned the hard way:** do **not** use `clip-path: inset(... 100%)` as the hidden state for a reveal element — in some browsers it zeroes the element's intersection box so the observer never fires and the heading stays invisible. The reveals here use opacity + translate instead. Keep it that way.

---

## 10. Accessibility checklist (keep these intact)

- Dark ink on cream meets WCAG AA contrast for text.
- The two-pink system (fills vs. text) exists specifically to keep pink legible — don't use the pale pink for text.
- "Skip to content" link, visible focus rings (`:focus-visible`).
- Project rows are keyboard-operable (Tab to focus, Enter/Space to activate) and have `aria-label`s.
- Decorative ASCII is `aria-hidden`.
- `prefers-reduced-motion` is honored — animations freeze for users who request it.
- The photo has descriptive `alt` text.

If you add interactive elements, give them visible focus states and keyboard support too.

---

## 11. Known limitations / TODO

- **Project case studies are placeholders.** Clicking any project shows a "coming soon" popup. Replace with real case study pages when ready (see §7).
- **The big lounging cat is in a fixed screen position** (right-center), so it can sit faintly behind body text on some sections. It's subtle, but if it bothers you, move its `fx`/`fy` in `ascii.js` to a quieter spot or remove that placement.
- No analytics, contact form, or blog — it's a static one-pager by design.

---

## 12. Quick reference

```
Edit content ............ index.html
Edit styling ............ style.css   (then bump ?v= in index.html)
Edit the star field ..... ascii.js    (then bump ?v= in index.html)
Preview locally ......... python -m http.server 3000  → localhost:3000
Publish ................. git add . && git commit -m "..." && git push
See changes live ........ wait ~1 min, then Ctrl+F5
```

---

*Last updated: June 2026.*
