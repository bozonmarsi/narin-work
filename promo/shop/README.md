# NARIN shop front: glass decals (SVG)

Print-ready SVG, 1 unit = 1 mm, all text outlined (no fonts needed). Sizes from the entrance plan of 12.11.2026.

| file | size | what |
|---|---|---|
| `out/arch-decal-white.svg` | 1440 × 700 mm | arch glass: logo, "květinový ateliér", "Květiny · Dárky · Pokojovky", daisies (white text) |
| `out/arch-decal-blue.svg` | 1440 × 700 mm | the same with cobalt text, for a light background behind the glass |
| `out/door-window-left.svg` | 280 × 1000 mm | left leaf (73): daisies + "květinový ateliér" at eye level |
| `out/door-window-right.svg` | 280 × 1000 mm | right leaf (75, main): daisies + logo + "Květiny / Dárky / Pokojovky" |
| `out/arch-mockup.svg`, `out/entrance-mockup.svg` | — | previews only, not for print |
| `out/narin-logo-*.svg`, `out/narin-lockup-*.svg` | — | logo / logo with "květinový ateliér", white and blue |

Each decal has a magenta `cut-guide (do not print)` layer with the glass outline, then `daisies`, `logo`, `text` layers.
Measure the glass before printing: the plan marks several sizes as approximate.

Regenerate: `python3 make_svgs.py Ubuntu-Medium.ttf out` (needs fontTools; `daisy_path.txt` is the logo daisy traced by `trace_daisy.py`).
