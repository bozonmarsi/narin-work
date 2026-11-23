# FC Sajfer — intro (first seconds of the kit promo)

9:16 (1080×1920), 7 s. Blue ground (the club colour) with red, yellow and green light moving over it.
The kit's white pinstripes draw down the screen and stay on as a faint texture; the club crest settles in
out of a blur, then the kit maker's mark (light grey) and the white NARIN "A", separated by fine fading
hairlines with a small diamond. All easing is soft.

- `template.html` — the animation (canvas); `build.py` inlines `assets/` and `mark_path.txt` → `kit.html`
- `render.js` — renders `kit.html` frame by frame to mp4: `node render.js $PWD/kit.html out.mp4 30`
- `assets/crest_color.png` from `assets/crest.svg`; `assets/A_white.png` (NARIN A, letter white, tulips kept);
  `mark_path.txt` is the kit maker's mark traced from the supplied image
