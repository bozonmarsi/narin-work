# NARIN shop front: arch glass decal (SVG)

**Final for production: `print/`** (variant `P-garden-line`): `NARIN-arch-1440x700mm.svg/.pdf` (1:1, outside mounting),
`…-MIRRORED.svg/.pdf` (inside mounting), `NARIN-arch-spec.pdf` (dimensioned drawing, sizes, colours, material; Czech + Russian).
Regenerate: `python3 make_svgs.py Ubuntu-Medium.ttf out` then `python3 make_spec.py`; PDFs are printed from the SVG/HTML with headless Chromium.

Print-ready SVG for the arch glass over the entrance, 1440 × 700 mm (1 unit = 1 mm), text outlined (no fonts needed).
Sixteen layouts of the label daisies, all daisies of one size within a layout:

| variant | daisies |
|---|---|
| `A-garland` | a garland of 19 daisies along the arch |
| `B-bouquets` | two small bouquets of four at the sides |
| `C-ribbon` | a row of 13 small daisies between "květinový ateliér" and the bottom line |
| `D-minimal` | two daisies in place of the dots in "Květiny · Dárky · Rostliny" |
| `E-scatter` | equal daisies scattered evenly over the whole glass, like on the label |
| `F-pattern` | equal daisies on a staggered grid over the whole glass |
| `G-scatter-small` | smaller equal daisies scattered more densely, daisies in place of the dots |
| `H-big` | bigger, fewer equal daisies over the whole glass, around the text |
| `I-bigger` | the same with even bigger, fewer daisies |
| `J-big-nosub` | without "květinový ateliér": bigger logo and bottom line, big daisies around |
| `K-bigger-nosub` | the same with bigger, fewer daisies |
| `L-sign-flowerbox` | sign-painter layout: keyline and "KVĚTINY · DÁRKY · ROSTLINY" along the arch, NARIN in the middle, daisies on stems along the bottom like a window box |
| `M-wreath` | NARIN crowned by a half wreath of daisies and leaves, the line below |
| `N-sign-border` | as L, with a plain border of daisies instead of the stems |
| `O-garden-arc` | a garden along the bottom in two mixed rows (not mirrored): as an organic meadow (`meadow()`): long curving grass on one green base, chamomile, label daisies, cosmos, poppies, cornflowers, irises, orchids, anemones, a few roses and peonies, buds and baby's breath, colourways dealt in turn per kind; heads bigger and never overlapping, irises and orchids placed first on slender leaning stems, forget-me-nots, bellflowers, primroses, zinnias, buds, leafy clumps and grass (drawn in `flowers.py` in the label-daisy style, many two-tone); bigger lettering along the arch |
| `P-garden-line` | the same garden; "Květiny · Dárky · Rostliny" big and straight under NARIN |

- `out/arch-decal-<variant>.svg`: print file; the magenta `cut-guide (do not print)` layer is the glass outline.
- `out/arch-mockup-<variant>.svg`: the same in the frame, for viewing only. `out/preview/arch-variants.jpg` `arch-variants-scatter.jpg` `arch-variants-big.jpg` `arch-variants-nosub.jpg` `arch-concepts.jpg` and `arch-garden.jpg` compare them.
- `out/narin-logo-*.svg`, `out/narin-lockup-*.svg`: logo / logo with "květinový ateliér", white and blue.

Measure the glass before printing: the plan gives 144 × 70 cm as approximate.
Regenerate: `python3 make_svgs.py Ubuntu-Medium.ttf out` (needs fontTools; `daisy_path.txt` is the logo daisy traced by `trace_daisy.py`).
