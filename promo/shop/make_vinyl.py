"""Variant B of the arch decal, for shops without white-ink printing.

    python3 make_vinyl.py <render.js-capable node dir unused>   (needs Chromium via Playwright for the contour; see README)

From out/arch-decal-P-garden-line.svg it writes print/varianta-B/:
  B1-bila-rezana-folie.svg  - everything white (NARIN letters, the line of words, the keyline as an outlined band),
                              cut on a plotter from white vinyl. No printing.
  B2-tisk-s-orezem.svg      - the garden and the logo tulip, printed on white vinyl, with a CUT layer that follows
                              the artwork 1 mm outside it, outer edge and inner gaps (weeded), so the glass shows through.
  B-preview.svg             - both together on the glass, for checking.
Contours are traced from a 4 px/mm render (render_mask.png produced by tools/svg_mask.js).
"""
import copy
import math
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

HERE = pathlib.Path(__file__).parent
SRC = HERE / "out" / "arch-decal-P-garden-line.svg"
OUT = HERE / "print" / "varianta-B"
OUT.mkdir(parents=True, exist_ok=True)
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
ET.register_namespace("inkscape", "http://www.inkscape.org/namespaces/inkscape")
AW, AH = 1440, 700
ARCH = f"M0 {AH} A{AW / 2} {AH} 0 0 1 {AW} {AH} Z"


def layers(tree):
    return {g.get("id"): g for g in tree.getroot() if g.tag == f"{{{NS}}}g"}


def keyline_band(inset=34, width=4, a0=20, a1=160):
    """The keyline stroke as a closed outline (two elliptical arcs), so it can be plotter-cut."""
    pts_out, pts_in = [], []
    for i in range(201):
        t = math.radians(a0 + (a1 - a0) * i / 200)
        for pts, d in ((pts_out, -width / 2), (pts_in, width / 2)):
            rx, ry = AW / 2 - inset + d * -1, AH - inset + d * -1
            pts.append((AW / 2 - rx * math.cos(t), AH - ry * math.sin(t)))
    pts = pts_out + pts_in[::-1]
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "Z"


def svg_doc(body, title):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="{NS}" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
            f'width="{AW}mm" height="{AH}mm" viewBox="0 0 {AW} {AH}">\n<title>{title}</title>\n{body}\n</svg>\n')


def to_str(el):
    return ET.tostring(el, encoding="unicode")


def main(mask_png=None):
    tree = ET.parse(SRC)
    L = layers(tree)
    guide = '<g id="glass outline - reference only, do not cut" inkscape:groupmode="layer"><path d="' + ARCH + '" fill="none" stroke="#00AEEF" stroke-width="0.5"/></g>'

    # ---- B1: white cut vinyl: letters, line of words, keyline ----
    logo = copy.deepcopy(L["logo"])
    for parent in logo.iter():
        for child in list(parent):
            if child.get("id") == "tulip":
                parent.remove(child)
    text = copy.deepcopy(L["text"])
    white = (to_str(logo) + to_str(text)).replace('fill="#FFFFFF"', 'fill="#1A1A1A"')
    white = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", white)
    band = f'<path fill="#1A1A1A" d="{keyline_band()}"/>'
    b1 = svg_doc(guide + '\n<g id="CUT white vinyl" inkscape:groupmode="layer" inkscape:label="CUT white vinyl">' + white + band + "</g>",
                 "NARIN arch B1: white cut vinyl (shown dark for visibility), 1440 x 700 mm")
    (OUT / "B1-bila-rezana-folie.svg").write_text(b1, encoding="utf-8")

    # ---- B2: printed garden + tulip, contour cut ----
    tulip = None
    for el in L["logo"].iter():
        if el.get("id") == "tulip":
            tulip = el
    # the tulip sits inside the logo's transform group: keep that transform
    logo_tf = next(g for g in L["logo"] if g.tag == f"{{{NS}}}g").get("transform")
    art = to_str(L["garden"]) + f'<g transform="{logo_tf}">{to_str(tulip)}</g>'
    art = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", art)
    print_layer = f'<defs><clipPath id="glass"><path d="{ARCH}"/></clipPath></defs><g id="PRINT" clip-path="url(#glass)">{art}</g>'
    (OUT / "B2-art-only.svg").write_text(svg_doc(print_layer, "art only (for tracing)"), encoding="utf-8")
    if mask_png:
        cut = trace_contour(mask_png)
        b2 = svg_doc(print_layer + f'\n<g id="CUT contour" inkscape:groupmode="layer" inkscape:label="CUT contour"><path d="{cut}" fill="none" stroke="#FF00FF" stroke-width="0.5"/></g>',
                     "NARIN arch B2: print on white vinyl + contour cut (magenta), 1440 x 700 mm")
        (OUT / "B2-tisk-s-orezem.svg").write_text(b2, encoding="utf-8")
        prev = svg_doc(f'<path d="{ARCH}" fill="#2E3A52"/>' + white.replace('fill="#1A1A1A"', 'fill="#FFFFFF"')
                       + band.replace("#1A1A1A", "#FFFFFF") + print_layer
                       + f'<path d="{cut}" fill="none" stroke="#FF00FF" stroke-width="1.5"/>', "B preview")
        (OUT / "B-preview.svg").write_text(prev, encoding="utf-8")


def trace_contour(mask_png, px_per_mm=4, offset_mm=1.0, min_hole_mm2=25):
    """Cut line 1 mm outside the artwork: the outer edge plus every gap inside it bigger than ~25 mm²,
    so the vinyl between stems and flowers is weeded out and the glass shows through."""
    import cv2
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(mask_png).convert("RGBA"))[..., 3]
    m = (a > 20).astype(np.uint8) * 255
    r = int(round(offset_mm * px_per_mm))
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d, outer, holes = [], 0, 0
    for c, h in zip(cs, hier[0]):
        area = cv2.contourArea(c) / px_per_mm ** 2
        is_hole = h[3] >= 0
        if area < (min_hole_mm2 if is_hole else 40):
            continue
        p = cv2.approxPolyDP(c, 0.8, True)[:, 0, :] / px_per_mm
        d.append("M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in p) + "Z")
        holes += is_hole
        outer += not is_hole
    print("outer contours", outer, "holes", holes)
    return " ".join(d)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
