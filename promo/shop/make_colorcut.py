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


BAND_TOP, BAND_COL = 72, "#237A43"   # solid lower part: mm above the bottom edge, colour


def band():
    """Solid green from the ground up to about the middle of the stems, soft wavy top: nothing to cut or weed inside it."""
    import math
    pts = [(x, AH - BAND_TOP + 6 * math.sin(x / 85) + 4 * math.sin(x / 37 + 1.3)) for x in range(0, AW + 1, 10)]
    d = f"M0 {AH + 5} " + " ".join(f"L{x} {y:.1f}" for x, y in pts) + f" L{AW} {AH + 5}Z"
    return f'<defs><clipPath id="bandglass"><path d="{ARCH}"/></clipPath></defs><path clip-path="url(#bandglass)" fill="{BAND_COL}" d="{d}"/>'


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
