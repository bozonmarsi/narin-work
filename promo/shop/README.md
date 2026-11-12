# NARIN shop front: arch glass decal (SVG)

Print-ready SVG for the arch glass over the entrance, 1440 × 700 mm (1 unit = 1 mm), text outlined (no fonts needed).
Seven layouts of the label daisies, all daisies of one size within a layout:

| variant | daisies |
|---|---|
| `A-garland` | a garland of 19 daisies along the arch |
| `B-bouquets` | two small bouquets of four at the sides |
| `C-ribbon` | a row of 13 small daisies between "květinový ateliér" and the bottom line |
| `D-minimal` | two daisies in place of the dots in "Květiny · Dárky · Pokojovky" |
| `E-scatter` | equal daisies scattered evenly over the whole glass, like on the label |
| `F-pattern` | equal daisies on a staggered grid over the whole glass |
| `G-scatter-small` | smaller equal daisies scattered more densely, daisies in place of the dots |

- `out/arch-decal-<variant>.svg`: print file; the magenta `cut-guide (do not print)` layer is the glass outline.
- `out/arch-mockup-<variant>.svg`: the same in the frame, for viewing only. `out/preview/arch-variants.jpg` and `arch-variants-scatter.jpg` compare them.
- `out/narin-logo-*.svg`, `out/narin-lockup-*.svg`: logo / logo with "květinový ateliér", white and blue.

Measure the glass before printing: the plan gives 144 × 70 cm as approximate.
Regenerate: `python3 make_svgs.py Ubuntu-Medium.ttf out` (needs fontTools; `daisy_path.txt` is the logo daisy traced by `trace_daisy.py`).
