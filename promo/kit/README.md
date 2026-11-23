# FC Sajfer — intro (first seconds of the kit promo)

9:16 (1080×1920), 6 s: dark ground with a slow, smooth colour mesh in the crest and kit colours (blue, red, yellow, green, royal blue)
flowing behind; logos at one size: the club crest, the kit maker's mark (light grey) and the white NARIN "A" drop in from top to bottom,
each with a quick shine.

- `template.html` — the animation (canvas); `build.py` inlines `assets/` and `mark_path.txt` → `kit.html`
- `render.js` — renders `kit.html` frame by frame to mp4: `node render.js $PWD/kit.html out.mp4 30`
- `assets/crest_color.png` from `assets/crest.svg`, `assets/A_white.png` (NARIN A, letter white, tulips kept);
  `mark_path.txt` is the kit maker's mark traced from the supplied image
