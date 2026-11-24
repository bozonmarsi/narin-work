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


def inside_arch(x, y, margin=0.0):
    rx, ry = AW / 2 - margin, AH - margin
    return ((x - AW / 2) / rx) ** 2 + ((y - AH) / ry) ** 2 <= 1


def fillers(max_h=140, seed=77):
    """Extra low flowers, buds and leaves between the existing ones, drawn behind them, so no empty gaps remain."""
    import random
    import flowers as FL
    rnd = random.Random(seed)
    cols = ["#FFD84D", "#FF7C77", "#C9A7FF", "#7FB6FF", "#FFA8C5", "#FFB86B"]
    out, x = [], 52.0
    while x < AW - 52:
        h = max_h * rnd.uniform(0.38, 0.68)
        k = rnd.random()
        side = rnd.choice((-1, 1))
        if inside_arch(x, AH - h - 30, 34):
            if k < 0.30:
                out += FL.leafy(x, AH + 2, h * 0.6)
            elif k < 0.55:
                c = rnd.choice(cols)
                out += FL.tiny_cluster(x, AH + 2, h * 0.85, c, "#FFFFFF" if c == "#FFD84D" else "#FFD84D", side)
            elif k < 0.80:
                out += FL.buds(x, AH + 2, h * 0.8, rnd.choice(cols), side)
            else:
                els, (hx, hy) = FL.on_stem(None, x, AH + 2, h, side)
                out += els + [FL.cosmos(hx, hy, 40, rnd.choice(cols), "#FFD84D", rnd.uniform(0, 40))]
        x += rnd.uniform(30, 44)
    return "".join(out)


def meadow_bg(top=480):
    """Soft background for the garden sticker: warm cream sky, two rolling pale-green hills, a few pollen dots."""
    import math
    import random
    rnd = random.Random(5)
    def hill(y0, amp, wl, ph, col):
        pts = " ".join(f"L{x} {y0 + amp * math.sin(x / wl + ph) + amp * 0.4 * math.sin(x / (wl * 0.37) + ph * 2):.1f}"
                       for x in range(0, AW + 20, 20))
        return f'<path fill="{col}" d="M0 {AH + 10} {pts[1:] if False else pts} L{AW} {AH + 10}Z"/>'.replace(f"M0 {AH + 10} L", f"M0 {AH + 10} L", 1)
    dots = "".join(f'<circle cx="{rnd.uniform(0, AW):.1f}" cy="{rnd.uniform(top, AH - 60):.1f}" r="{rnd.uniform(1.5, 3.2):.1f}" '
                   f'fill="{rnd.choice(["#FFFFFF", "#FFE7A3", "#F7D2E4"])}"/>' for _ in range(260))
    return ('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#FFF6E6"/><stop offset="1" stop-color="#EAF6E4"/></linearGradient></defs>'
            f'<rect x="-10" y="{top}" width="{AW + 20}" height="{AH - top + 20}" fill="url(#sky)"/>'
            + dots + hill(AH - 95, 14, 70, 0.6, "#D7EFD3") + hill(AH - 62, 11, 52, 2.1, "#BFE5C1"))


def variant_e(mask_dir=None):
    """Variant E for a plotter that cannot cut precisely around print, everything on WHITE vinyl:
    E1 = white cut letters (NARIN without the A, words, keyline);
    E2a = garden sticker: flowers + fillers on a soft meadow background printed with bleed past a smooth cut line
          that runs >= 6 mm from every flower, so an inaccurate cut only trims background;
    E2b = the A exactly as in the logo (white vinyl) with the tulips, outline only 2 mm where the tulips leave the A."""
    out = HERE / "print" / "varianta-E"
    out.mkdir(parents=True, exist_ok=True)
    tree = ET.parse(SRC)
    L = layers(tree)
    logo_tf = next(g for g in L["logo"] if g.tag == f"{{{NS}}}g").get("transform")
    tulip = next(el for el in L["logo"].iter() if el.get("id") == "tulip")
    tulip_tf = tulip.get("transform") or ""
    clean = lambda x: re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", x)
    a_body = clean(f'<g transform="{logo_tf}"><g transform="{tulip_tf}">{"".join(to_str(e) for e in tulip if e.get("fill") == "#FFFFFF")}</g></g>')
    col_tulip = copy.deepcopy(tulip)
    for e in list(col_tulip):
        if e.get("fill") == "#FFFFFF":
            col_tulip.remove(e)
    tul = clean(f'<g transform="{logo_tf}">{to_str(col_tulip)}</g>')
    garden = fillers() + clean(to_str(L["garden"]))
    clip = f'<defs><clipPath id="glass"><path d="{ARCH}"/></clipPath></defs>'
    masks = {"garden": f'{clip}<g clip-path="url(#glass)">{garden}</g>', "tulip": tul, "abody": a_body}
    if not mask_dir:
        for k, v in masks.items():
            (out / f"mask-{k}.svg").write_text(svg_doc(v, "m"), encoding="utf-8")
        return
    for k in masks:
        (out / f"mask-{k}.svg").unlink(missing_ok=True)
    md = pathlib.Path(mask_dir)
    g_cut, g_bleed, a_cut = sticker_contours(md)
    cutp = lambda d, w=0.5: f'<path d="{d}" fill="none" stroke="#FF00FF" stroke-width="{w}"/>'
    bg = f'<clipPath id="bleed"><path d="{g_bleed}"/></clipPath>'
    garden_art = f'<defs>{bg}</defs><g clip-path="url(#bleed)">{meadow_bg()}</g>{clip}<g clip-path="url(#glass)">{garden}</g>'
    a_art = a_body + tul
    (out / "E2-tisk-na-bilou-folii.svg").write_text(svg_doc(
        f'<g id="PRINT on white vinyl">{garden_art}{a_art}</g><g id="CUT contour" inkscape:groupmode="layer">{cutp(g_cut)}{cutp(a_cut)}</g>',
        "NARIN arch E2: print on WHITE vinyl (background printed with 3 mm bleed) + cut along magenta, 1440 x 700 mm"), encoding="utf-8")
    b1 = (HERE / "print" / "varianta-B" / "B1-bila-rezana-folie.svg").read_text(encoding="utf-8").replace("B1:", "E1:")
    (out / "E1-bila-rezana-folie.svg").write_text(b1, encoding="utf-8")
    logo = copy.deepcopy(L["logo"])
    for parent in logo.iter():
        for child in list(parent):
            if child.get("id") == "tulip":
                parent.remove(child)
    white = clean(to_str(logo) + to_str(L["text"])) + f'<path fill="#FFFFFF" d="{keyline_band()}"/>'
    glass = f'<path d="{ARCH}" fill="#2E3A52"/>'
    vis = (f'<defs><clipPath id="gc"><path d="{g_cut}"/></clipPath><clipPath id="ac"><path d="{a_cut}"/></clipPath>{bg}</defs>'
           f'<g clip-path="url(#gc)"><g clip-path="url(#bleed)">{meadow_bg()}</g>{clip}<g clip-path="url(#glass)">{garden}</g></g>'
           f'<path d="{a_cut}" fill="#FFFFFF"/><g clip-path="url(#ac)">{a_art}</g>')
    (out / "E-preview.svg").write_text(svg_doc(glass + white + vis, "E preview"), encoding="utf-8")


def sticker_contours(md, k=4):
    import cv2
    import numpy as np
    from PIL import Image
    ld = lambda n: ((np.asarray(Image.open(md / f"maskE-{n}.png").convert("RGBA"))[..., 3] > 20).astype(np.uint8) * 255)
    disk = lambda mm: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(mm * k) + 1,) * 2)
    h, w = ld("garden").shape
    glass = np.zeros((h, w), np.uint8)
    cv2.ellipse(glass, (w // 2, h), (w // 2, h), 0, 180, 360, 255, -1)

    def trace(m, eps=1.2):
        cs, hier = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        return " ".join("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in cv2.approxPolyDP(c, eps, True)[:, 0, :] / k) + "Z"
                        for c in cs if cv2.contourArea(c) > 200 * k * k)
    g = cv2.morphologyEx(cv2.dilate(ld("garden"), disk(6)), cv2.MORPH_CLOSE, disk(16))
    g = cv2.bitwise_and(cv2.morphologyEx(g, cv2.MORPH_OPEN, disk(5)), glass)
    bleed = cv2.bitwise_and(cv2.dilate(g, disk(3)), glass)
    a = cv2.bitwise_or(ld("abody"), cv2.dilate(ld("tulip"), disk(2)))
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, disk(0.75))
    return trace(g), trace(bleed), trace(a, 0.6)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "E":
        variant_e(sys.argv[2] if len(sys.argv) > 2 else None)
        sys.exit()
    if len(sys.argv) > 1 and sys.argv[1] == "D":
        variant_d(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else None)
