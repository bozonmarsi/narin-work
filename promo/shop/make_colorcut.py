"""Variant Z: the approved design in full COLOUR printed on WHITE vinyl, contour-cut 1 mm round the artwork
(gaps bigger than 25 mm² weeded out so the glass shows through). White parts = the vinyl itself, no ink.
Step 1: python make_colorcut.py -> print/varianta-Z/Z-art.svg ; render its alpha at 4 px/mm
Step 2: python make_colorcut.py <mask.png> -> Z-tisk-barevne-s-orezem.svg (+ mirrored) + Z-preview.svg"""
import pathlib
import re
import sys

from make_vinyl import ARCH, AH, AW, trace_contour

HERE = pathlib.Path(__file__).parent
SRC = HERE / "out" / "arch-decal-P-garden-line.svg"
OUT = HERE / "print" / "varianta-Z"


def band():
    """A dense meadow behind the flowers instead of a flat band: three rows of soft curved grass blades, darkest and
    tallest at the back, over a solid dark base. Solid from the ground to ~6-9 cm, its top edge is just grass tips,
    so the cut there is a simple, readable line and nothing has to be weeded inside."""
    import random
    rnd = random.Random(12)
    out = [f'<path fill="#1C6437" d="M0 {AH + 5} L0 {AH - 40} L{AW} {AH - 40} L{AW} {AH + 5}Z"/>']
    for step, w, hmin, hmax, cols in ((8, 20, 58, 92, ["#1C6437", "#1F6E3C", "#22743F"]),
                                      (10, 18, 38, 62, ["#26864A", "#2A9A4B"]),
                                      (12, 16, 20, 38, ["#36A85A", "#3DAF5C", "#44B865"])):
        x = -5.0
        while x < AW + 5:
            h = rnd.uniform(hmin, hmax)
            lean = rnd.uniform(-14, 14)
            ww = w * rnd.uniform(0.8, 1.15)
            tx, ty = x + lean, AH - h
            out.append(f'<path fill="{rnd.choice(cols)}" d="M{x - ww / 2:.1f} {AH + 2} '
                       f'Q{x - ww * 0.25 + lean * 0.35:.1f} {AH - h * 0.55:.1f} {tx:.1f} {ty:.1f} '
                       f'Q{x + ww * 0.3 + lean * 0.3:.1f} {AH - h * 0.5:.1f} {x + ww / 2:.1f} {AH + 2}Z"/>')
            x += step * rnd.uniform(0.75, 1.25)
    return (f'<defs><clipPath id="bandglass"><path d="{ARCH}"/></clipPath></defs>'
            f'<g clip-path="url(#bandglass)">{"".join(out)}</g>')


def art():
    s = SRC.read_text(encoding="utf-8")
    s = re.sub(r'<g id="cut-guide.*?</g>', "", s, count=1, flags=re.S)
    s = re.sub(r'(<g id="garden"[^>]*>)', lambda m: m.group(1) + band(), s, count=1)
    return re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", s, flags=re.S)


def doc(body, title):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" '
            f'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="{AW}mm" height="{AH}mm" '
            f'viewBox="0 0 {AW} {AH}"><title>{title}</title>{body}</svg>\n')


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    a = art()
    if len(sys.argv) < 2:
        (OUT / "Z-art.svg").write_text(doc(a, "art"), encoding="utf-8")
    else:
        cut = trace_contour(sys.argv[1], offset_mm=1.5, min_hole_mm2=150)
        guide = f'<g id="glass outline - do not cut" inkscape:groupmode="layer"><path d="{ARCH}" fill="none" stroke="#00AEEF" stroke-width="0.5"/></g>'
        body = (f'<g id="PRINT" inkscape:groupmode="layer">{a}</g>' + guide +
                f'<g id="CUT contour" inkscape:groupmode="layer"><path d="{cut}" fill="none" stroke="#FF00FF" stroke-width="0.5"/></g>')
        t = "NARIN arch Z: full-colour print on WHITE vinyl (white = no ink) + contour cut (magenta), 1440 x 700 mm"
        (OUT / "Z-tisk-barevne-s-orezem.svg").write_text(doc(body, t), encoding="utf-8")
        (OUT / "Z-tisk-barevne-s-orezem-ZRCADLOVE.svg").write_text(
            doc(f'<g transform="translate({AW} 0) scale(-1 1)">{body}</g>', t + ", MIRRORED for mounting from inside"), encoding="utf-8")
        (OUT / "Z-preview.svg").write_text(doc(f'<path d="{ARCH}" fill="#2E3A52"/><defs><clipPath id="c"><path d="{cut}" clip-rule="evenodd"/></clipPath></defs>'
                                               f'<path d="{cut}" fill="#FFFFFF" fill-rule="evenodd"/><g clip-path="url(#c)">{a}</g>', "Z preview"), encoding="utf-8")
        (OUT / "Z-art.svg").unlink(missing_ok=True)
