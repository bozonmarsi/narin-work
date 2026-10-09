# KOVKA — animated presentation

Instagram landscape ad (16:9, 1920×1080, 24 s, cut on a 120 BPM grid): KOVKA? hook → word flashes on label colours →
hero can with ribbons → five variants ("Každá je jiná.") → line-up → use cases → end card with CTA.
White paper, the logo daisy recoloured in label colours, a hand-drawn meadow moving on twos.

- `template.html` — page source (assets as `%%name%%` placeholders); `build.py` inlines them → `kovka.html`
- `render.js` — renders `kovka.html` frame by frame into an mp4: `node render.js $PWD/kovka.html out.mp4 30`
- `assets/` — product cut-outs (`k1..k5.webp`), wordmark glyphs, `daisy.png` (logo daisy mask)
- `rb.py`, `fix2.py`, `logo.py` — how the assets were made

Space = pause, ←/→ = seek, tap = gust of wind.
