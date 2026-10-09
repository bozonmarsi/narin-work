# KOVKA — animated presentation

Single-file canvas film (~44 s loop) on white paper: KOVKA? → a hand-drawn meadow of label daisies grows and
flips colour → "Malá květinová kompozice v kovové plechovce s vodou." → the camera walks along five kovky in
the meadow → line-up with the wordmark. Drawn things move on twos (12 fps) with a slight line boil; camera and
type move smoothly.

- `template.html` — page source (assets as `%%name%%` placeholders)
- `assets/` — product cut-outs (`k1..k5.webp`) and wordmark glyphs (`K1 O V K2 A Q .png`)
- `build.py` — inlines assets → `kovka.html`: `python3 build.py`
- `rb.py`, `fix2.py` — background removal (rembg `isnet-general-use`; `fix2.py` keeps the blue sprigs in photo 2)
- `logo.py` — splits the wordmark into letters

Tap the meadow to send a gust of wind. Space = pause, ←/→ = seek.
