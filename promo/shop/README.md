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
| `O-garden-arc` | a garden along the bottom in two mixed rows (gerberas, cosmos, anemones, daisies, forget-me-nots, bellflowers, primroses, zinnias, buds, leaf clumps) on a continuous lawn; lettering along the arch |
| `P-garden-line` | **chosen for print**: the same garden; "Květiny · Dárky · Rostliny" big and straight under NARIN |

- `out/arch-decal-<variant>.svg`: print file; the magenta `cut-guide (do not print)` layer is the glass outline.
- `out/arch-mockup-<variant>.svg`: the same in the frame, for viewing only. `out/preview/arch-variants.jpg` `arch-variants-scatter.jpg` `arch-variants-big.jpg` `arch-variants-nosub.jpg` `arch-concepts.jpg` and `arch-garden.jpg` compare them.
- `out/narin-logo-*.svg`, `out/narin-lockup-*.svg`: logo / logo with "květinový ateliér", white and blue.

Measure the glass before printing: the plan gives 144 × 70 cm as approximate.
Regenerate: `python3 make_svgs.py Ubuntu-Medium.ttf out` (needs fontTools; `daisy_path.txt` is the logo daisy traced by `trace_daisy.py`).

## Variant B (no white ink): `print/varianta-B/`

For shops that cannot print white on clear film (`make_vinyl.py`, contour traced from a 4 px/mm render):
- `B1-bila-rezana-folie.svg/.pdf` — plotter-cut **white vinyl**: NARIN letters (without the A), the line of words, the
  keyline as a 4 mm band. Shown dark in the file for visibility.
- `B2-tisk-s-orezem.svg/.pdf` — **print on white vinyl** (garden + the logo's tulip A; white = the vinyl itself) with a
  magenta `CUT contour` 1 mm outside the artwork, outer edge and inner gaps, which are weeded out.
- `B-preview.*` — both together on the glass.

## Variant C (one printed sticker on blue): `print/varianta-C/`

For a shop that only prints on white vinyl and cuts to shape: the whole arch on the brand blue (#1C70E3), so the white
lettering is simply unprinted vinyl. 3 mm bleed, magenta CUT = the arch. Blue-on-blue flowers recoloured to lilac.

## Variant D (plotter, no white ink, no precise cut): `print/varianta-D/`

For a shop like KRÉDO that has a plotter but no white ink and will not contour-cut precisely (`make_vinyl.py D <mask.png>`):
- `D1-bila-rezana-folie.svg/.pdf` — plotter-cut **white vinyl**: NARIN incl. the white body of the A, the line of words,
  the keyline band. Shown dark in the file for visibility.
- `D2-tisk-na-ciru-folii.svg/.pdf` — garden + colour tulip printed on **clear vinyl without white**, magenta
  `CUT loose shape` about 5–10 mm outside the artwork (smooth, no inner holes); the extra clear film is invisible on glass.
  Colours are translucent against the light.
- `D-preview.*`, `nahled.png` — both together on the glass.

## Variants E and F (for KRÉDO: everything on white vinyl): `print/varianta-E/`, `print/varianta-F/`

Glass stays clear, colours stay opaque. Build: `python make_vinyl.py E` → render the 3 masks at 4 px/mm as
`maskE-{garden,tulip,abody}.png` → `python make_vinyl.py E <dir>` (writes both E and F).
- `*1-bila-rezana-folie` — plotter-cut **white vinyl**: NARIN without the A, line of words, keyline (= B1).
- `*2-tisk-na-bilou-folii` — printed on **white vinyl**, 2 pieces:
  - garden: the approved P garden alone (nothing added) on one calm, flat green backdrop (#2D7550) with a soft scalloped
    edge, printed with 3 mm bleed (`foliage()` is kept but unused: the user found it too busy).
    The smooth magenta cut runs ≥ 6 mm from every flower, so an inaccurate cut only trims green;
  - the A with the tulips: **E** = tulips outlined 2 mm (easy cut); **F** = cut exactly on the logo's own edge, every gap
    between the leaf, the stems and the A open, so it reads clearly as an A (precise cut needed for this one piece).
- `*-preview.*`, `nahled.png` — on the glass.

## Variant W (CHOSEN: everything plotter-cut from white vinyl, no printing): `print/varianta-W/`

`python make_white.py` → render `W-render.svg` at 4 px/mm on black → `python make_white.py <png>`.
The approved design as a paper-cut: every flower white with a 3 mm see-through gap, lawn = plain white ground,
tulips in the A = one white silhouette with a 3 mm gap to the A body; letters, words and keyline unchanged.
- `W-bila-rezana-folie.svg/.pdf` — the cut file (shown dark), blue arch = glass outline, not cut.
- `W-bila-rezana-folie-ZRCADLOVE.*` — mirrored, for mounting from inside.
- `W-preview.*`, `nahled.png`.

## Variant Z (CHOSEN for order with installation): `print/varianta-Z/`

The approved design in full colour, printed on **white vinyl** (white = no ink) with a magenta contour cut 1 mm round
the artwork (1.5 mm); flowers only: the lawn bands and grass blades are removed (`band()` kept, unused); nothing is weeded
in the lower part; all gaps over 4 mm² are weeded, incl. the counters of the letters (e, a, o, D, R). One file, one job (`make_colorcut.py`).
- `Z-tisk-barevne-s-orezem.svg/.pdf` (+ `-ZRCADLOVE` mirrored for mounting from inside)
- `Z-preview.*`, `nahled.png`, `detail-orezu.png` (close-up of the cut line)
