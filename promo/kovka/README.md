# KOVKA — animated presentation

Single-file canvas "film" (~40 s loop): KOVKA? → flipping daisy mosaic → words → five kovky → finale.

- `template.html` — the page source (assets as `%%name%%` placeholders)
- `assets/` — cut-out product photos (`k1..k5.webp`) and wordmark glyphs (`K1 O V K2 A Q .png`)
- `build.py` — inlines assets → `kovka.html`: `python3 build.py`
- `cut.py` / `logo.py` — how the assets were made (white-background removal, wordmark split)

Tap the mosaic to send your own wave. Space = pause, ←/→ = seek.
