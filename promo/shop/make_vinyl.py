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


def variant_d(mask_png=None):
    """Variant D for a shop with a plotter but no white ink and no precise contour cut (KRÉDO):
    D1 white cut vinyl = everything white incl. the white body of the A; D2 = garden + tulips printed on CLEAR
    vinyl (no white), cut along a loose, smooth line well clear of the artwork, so the glass stays see-through."""
    out = HERE / "print" / "varianta-D"
    out.mkdir(parents=True, exist_ok=True)
    tree = ET.parse(SRC)
    L = layers(tree)
    logo_tf = next(g for g in L["logo"] if g.tag == f"{{{NS}}}g").get("transform")
    tulip = next(el for el in L["logo"].iter() if el.get("id") == "tulip")
    tulip_tf = tulip.get("transform") or ""
    white_bits = [to_str(e) for e in tulip if e.get("fill") == "#FFFFFF"]
    colour_tulip = copy.deepcopy(tulip)
    for e in list(colour_tulip):
        if e.get("fill") == "#FFFFFF":
            colour_tulip.remove(e)
    guide = '<g id="glass outline - reference only, do not cut" inkscape:groupmode="layer"><path d="' + ARCH + '" fill="none" stroke="#00AEEF" stroke-width="0.5"/></g>'
    # D1
    logo = copy.deepcopy(L["logo"])
    for parent in logo.iter():
        for child in list(parent):
            if child.get("id") == "tulip":
                parent.remove(child)
    a_body = f'<g transform="{logo_tf}"><g transform="{tulip_tf}">{"".join(white_bits)}</g></g>'
    white = to_str(logo) + to_str(L["text"]) + a_body
    white = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", white).replace('fill="#FFFFFF"', 'fill="#1A1A1A"')
    band = f'<path fill="#1A1A1A" d="{keyline_band()}"/>'
    (out / "D1-bila-rezana-folie.svg").write_text(svg_doc(guide + '<g id="CUT white vinyl" inkscape:groupmode="layer">' + white + band + "</g>",
        "NARIN arch D1: white cut vinyl (shown dark for visibility) incl. the white body of the A, 1440 x 700 mm"), encoding="utf-8")
    # D2
    art = to_str(L["garden"]) + f'<g transform="{logo_tf}">{to_str(colour_tulip)}</g>'
    art = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", art)
    print_layer = f'<defs><clipPath id="glass"><path d="{ARCH}"/></clipPath></defs><g id="PRINT on clear vinyl" clip-path="url(#glass)">{art}</g>'
    (out / "D2-art-only.svg").write_text(svg_doc(print_layer, "art only"), encoding="utf-8")
    if mask_png:
        cut = loose_contour(mask_png)
        (out / "D2-tisk-na-ciru-folii.svg").write_text(svg_doc(print_layer + f'<g id="CUT loose shape" inkscape:groupmode="layer"><path d="{cut}" fill="none" stroke="#FF00FF" stroke-width="0.5"/></g>',
            "NARIN arch D2: print on CLEAR vinyl (no white), loose cut along the magenta line, 1440 x 700 mm"), encoding="utf-8")
        prev = svg_doc(f'<path d="{ARCH}" fill="#2E3A52"/>' + white.replace('fill="#1A1A1A"', 'fill="#FFFFFF"') + band.replace("#1A1A1A", "#FFFFFF")
                       + print_layer + f'<path d="{cut}" fill="none" stroke="#FF00FF" stroke-width="1.5"/>', "D preview")
        (out / "D-preview.svg").write_text(prev, encoding="utf-8")
        (out / "D2-art-only.svg").unlink()


def loose_contour(mask_png, px_per_mm=4, offset_mm=10.0):
    """A smooth, easy-to-cut outline well outside the artwork (only outer edges, clipped to the glass)."""
    import cv2
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(mask_png).convert("RGBA"))[..., 3]
    m = (a > 20).astype(np.uint8) * 255
    r = int(offset_mm * px_per_mm)
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r + 1, r + 1)))      # round off the dents
    glass = np.zeros_like(m)
    h, w = m.shape
    cv2.ellipse(glass, (w // 2, h), (w // 2, h), 0, 180, 360, 255, -1)
    m = cv2.bitwise_and(m, glass)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    d = []
    for c in cs:
        if cv2.contourArea(c) < 200 * px_per_mm ** 2:
            continue
        p = cv2.approxPolyDP(c, 3.0 * px_per_mm, True)[:, 0, :] / px_per_mm
        d.append("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p) + "Z")
    print("loose shapes", len(d), "points", sum(x.count("L") + 1 for x in d))
    return " ".join(d)


def variant_e(mask_dir=None):
    """Variant E, 'sticker' style for a plotter that cannot cut precisely around print: garden + tulip printed on WHITE
    vinyl, cut along a smooth line with a 6 mm white border, so a cut that is a few mm off never touches the artwork.
    The white body of the A is part of the tulip sticker. E1 = white cut vinyl without the A (same as B1)."""
    out = HERE / "print" / "varianta-E"
    out.mkdir(parents=True, exist_ok=True)
    tree = ET.parse(SRC)
    L = layers(tree)
    logo_tf = next(g for g in L["logo"] if g.tag == f"{{{NS}}}g").get("transform")
    tulip = next(el for el in L["logo"].iter() if el.get("id") == "tulip")
    clean = lambda x: re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", x)
    # white petals vanish on white vinyl: give them a soft pink
    garden = re.sub(r'fill="#(?:FFFFFF|ffffff|FFF|fff)"', 'fill="#FFC9D9"', clean(to_str(L["garden"])))
    tul = clean(f'<g transform="{logo_tf}">{to_str(tulip)}</g>')
    clip = f'<defs><clipPath id="glass"><path d="{ARCH}"/></clipPath></defs>'
    art = f'{clip}<g id="PRINT on white vinyl" clip-path="url(#glass)">{garden}{tul}</g>'
    if not mask_dir:
        (out / "mask-garden.svg").write_text(svg_doc(f'{clip}<g clip-path="url(#glass)">{garden}</g>', "m"), encoding="utf-8")
        (out / "mask-tulip.svg").write_text(svg_doc(tul, "m"), encoding="utf-8")
        return
    cut, fill = sticker_contour(pathlib.Path(mask_dir))
    (out / "mask-garden.svg").unlink(missing_ok=True)
    (out / "mask-tulip.svg").unlink(missing_ok=True)
    cut_layer = f'<g id="CUT contour" inkscape:groupmode="layer"><path d="{cut}" fill="none" stroke="#FF00FF" stroke-width="0.5"/></g>'
    (out / "E2-tisk-na-bilou-folii.svg").write_text(svg_doc(art + cut_layer,
        "NARIN arch E2: print on WHITE vinyl, smooth cut with 6 mm white border (magenta), 1440 x 700 mm"), encoding="utf-8")
    b1 = (HERE / "print" / "varianta-B" / "B1-bila-rezana-folie.svg").read_text(encoding="utf-8").replace("B1:", "E1:")
    (out / "E1-bila-rezana-folie.svg").write_text(b1, encoding="utf-8")
    logo = copy.deepcopy(L["logo"])
    for parent in logo.iter():
        for child in list(parent):
            if child.get("id") == "tulip":
                parent.remove(child)
    white = clean(to_str(logo) + to_str(L["text"])) + f'<path fill="#FFFFFF" d="{keyline_band()}"/>'
    prev = svg_doc(f'<path d="{ARCH}" fill="#2E3A52"/>{white}<path d="{cut}" fill="#FFFFFF"/>{art}', "E preview")
    (out / "E-preview.svg").write_text(prev, encoding="utf-8")
    (out / "E-preview-rez.svg").write_text(svg_doc(f'<path d="{ARCH}" fill="#2E3A52"/>{white}<path d="{cut}" fill="#FFFFFF"/>{art}'
        f'<path d="{cut}" fill="none" stroke="#FF00FF" stroke-width="1.5"/>', "E preview with cut"), encoding="utf-8")


def sticker_contour(mask_dir, px_per_mm=4, border_mm=6.0, close_mm=14.0):
    import cv2
    import numpy as np
    from PIL import Image
    ld = lambda n: ((np.asarray(Image.open(mask_dir / n).convert("RGBA"))[..., 3] > 20).astype(np.uint8) * 255)
    disk = lambda mm: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(mm * px_per_mm) + 1,) * 2)
    g, t = ld("maskE-garden.png"), ld("maskE-tulip.png")
    m = cv2.bitwise_or(cv2.dilate(g, disk(border_mm)), cv2.dilate(t, disk(border_mm)))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, disk(close_mm))            # fill narrow notches -> smooth, easy cut
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, disk(4))                     # no thin spikes
    h, w = m.shape
    glass = np.zeros_like(m)
    cv2.ellipse(glass, (w // 2, h), (w // 2, h), 0, 180, 360, 255, -1)
    m = cv2.bitwise_and(m, glass)
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d = []
    for c, hh in zip(cs, hier[0]):
        area = cv2.contourArea(c) / px_per_mm ** 2
        if hh[3] >= 0 or area < 200:      # outer edges only: nothing to weed inside
            continue
        p = cv2.approxPolyDP(c, 1.2, True)[:, 0, :] / px_per_mm
        d.append("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p) + "Z")
    print("sticker shapes", len(d), "points", sum(x.count("L") + 1 for x in d))
    return " ".join(d), m


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "E":
        variant_e(sys.argv[2] if len(sys.argv) > 2 else None)
        sys.exit()
    if len(sys.argv) > 1 and sys.argv[1] == "D":
        variant_d(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else None)
