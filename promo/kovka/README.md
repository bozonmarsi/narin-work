# KOVKA — animated presentation

Instagram landscape ad (16:9, 1920×1080, 30 s, cut on a 120 BPM grid): the NARIN logo turns into KOVKA (the tulip A
travels across) → how a kovka is made (illustrated can, water, hand-tied bouquet → real photo) → "Žádná kovka se
neopakuje." with a flipbook of past examples → occasions ("Hodí se vždycky.") → end card with CTA.
White paper, the logo daisy recoloured in label colours, a hand-drawn meadow moving on twos.

- `template.html` — page source (assets as `%%name%%` placeholders); `build.py` inlines them → `kovka.html`
- `render.js` — renders `kovka.html` frame by frame into an mp4: `node render.js $PWD/kovka.html out.mp4 30`
- `assets/` — product cut-outs (`k1..k5.webp`), wordmark glyphs, `daisy.png` (logo daisy mask)
- `rb.py`, `fix2.py`, `logo.py`, `narin.py` — how the assets were made (`n*.png` are the NARIN logo pieces)

Space = pause, ←/→ = seek, tap = gust of wind.
