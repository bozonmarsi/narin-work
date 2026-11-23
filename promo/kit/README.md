# FC Sajfer — intro (first seconds of the kit promo)

9:16 (1080×1920), 8 s, dark ground with a slow colour mesh in the crest and kit colours. The kit's white
pinstripes draw down the screen; an arched gateway draws itself and the stripes become the crest's portcullis;
the gate rises into the arch like a castle gate and the club crest settles in behind it (out of a blur);
then the kit maker's mark (light grey) and the white NARIN "A" follow, separated by fine fading hairlines
with a small diamond. All easing is soft (sine / cubic / quint), nothing drops or snaps.

- `template.html` — the animation (canvas); `build.py` inlines `assets/` and `mark_path.txt` → `kit.html`
- `render.js` — renders `kit.html` frame by frame to mp4: `node render.js $PWD/kit.html out.mp4 30`
- `assets/crest_color.png` from `assets/crest.svg`; `assets/A_white.png` (NARIN A, letter white, tulips kept);
  `mark_path.txt` is the kit maker's mark traced from the supplied image
