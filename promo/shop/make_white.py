"""Variant W: the whole approved arch as ONE colour of plotter-cut white vinyl (no printing).
Every coloured shape becomes white with a 3 mm see-through gap round it (paper-cut look), traced from a 4 px/mm render.
Step 1: python make_white.py           -> print/varianta-W/W-render.svg (white art on black)
Step 2: python make_white.py <png>     -> W-bila-rezana-folie.svg/.pdf (cut paths) + W-preview.svg"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
SRC = HERE / "out" / "arch-decal-P-garden-line.svg"
OUT = HERE / "print" / "varianta-W"
AW, AH, K = 1440, 700, 4
ARCH = f"M0 {AH} A{AW / 2} {AH} 0 0 1 {AW} {AH} Z"
GAP = 3.0


def render_svg():
    import copy
    import xml.etree.ElementTree as ET
    NS = "http://www.w3.org/2000/svg"
    ET.register_namespace("", NS)
    ET.register_namespace("inkscape", "http://www.inkscape.org/namespaces/inkscape")
    tree = ET.parse(SRC)
    root = tree.getroot()
    for g in list(root):
        if (g.get("id") or "").startswith("cut-guide"):
            root.remove(g)
    L = {g.get("id"): g for g in root if g.tag == f"{{{NS}}}g"}
    halo = {"stroke": "#000000", "stroke-width": f"{GAP}", "stroke-linejoin": "round"}

    def is_ground(el):
        m = re.match(r"\s*M\s*[-\d.]+[ ,]+([-\d.]+)", el.get("d") or "")
        return m and float(m.group(1)) >= AH - 1 and not (el.get("transform") or "")
    # garden: paper-cut look. Each filled shape white with a 3 mm see-through outline; the lawn/grass a plain white ground
    for el in L["garden"].iter():
        f, st = el.get("fill"), el.get("stroke")
        if st and st != "none":
            el.set("stroke", "#FFFFFF")
        if f and f != "none":
            el.set("fill", "#FFFFFF")
            if not is_ground(el):
                for k, v in halo.items():
                    el.set(k, v)
    # tulip in the A: one clean white silhouette, cut off from the A body by a 3 mm gap
    tulip = next(el for el in L["logo"].iter() if el.get("id") == "tulip")
    body = [e for e in tulip if e.get("fill") == "#FFFFFF"]
    parts = [e for e in tulip if e.get("fill") != "#FFFFFF"]
    for e in list(tulip):
        tulip.remove(e)
    for e in body:
        tulip.append(e)
    k = 1 / 0.128760   # the tulip group is scaled: gap in its own units
    for e in parts:
        h = copy.deepcopy(e)
        h.set("fill", "#000000"); h.set("stroke", "#000000"); h.set("stroke-width", f"{GAP * 2 * k:.1f}"); h.set("stroke-linejoin", "round")
        tulip.append(h)
    for e in parts:
        w = copy.deepcopy(e)
        w.set("fill", "#FFFFFF")
        if w.get("stroke") not in (None, "none"):
            w.set("stroke", "#FFFFFF")
        tulip.append(w)
    for el in L["keyline"].iter():
        if el.get("stroke") not in (None, "none"):
            el.set("stroke", "#FFFFFF")
        if el.get("fill") not in (None, "none"):
            el.set("fill", "#FFFFFF")
    return ET.tostring(root, encoding="unicode")


def trace(png):
    import cv2
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(png).convert("L"))
    m = (a > 128).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))   # no slivers < ~1 mm
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d, n = [], 0
    for c, h in zip(cs, hier[0]):
        area = cv2.contourArea(c) / K / K
        if area < (6 if h[3] >= 0 else 8):
            continue
        p = cv2.approxPolyDP(c, 0.6, True)[:, 0, :] / K
        d.append("M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in p) + "Z")
        n += 1
    print("cut paths", n)
    return " ".join(d)


def doc(body, title):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{AW}mm" height="{AH}mm" '
            f'viewBox="0 0 {AW} {AH}"><title>{title}</title>{body}</svg>\n')


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) < 2:
        s = render_svg()
        s = s.replace("</svg>", "", 1) if False else s
        s = re.sub(r"(<svg[^>]*>)", r'\1<rect x="-5" y="-5" width="1450" height="710" fill="#000000"/>', s, count=1)
        (OUT / "W-render.svg").write_text(s, encoding="utf-8")
    else:
        d = trace(sys.argv[1])
        guide = f'<path d="{ARCH}" fill="none" stroke="#00AEEF" stroke-width="0.5"/>'
        (OUT / "W-bila-rezana-folie.svg").write_text(doc(guide + f'<path d="{d}" fill="#1A1A1A" fill-rule="evenodd"/>',
            "NARIN arch W: everything plotter-cut from WHITE vinyl (shown dark), 1440 x 700 mm, blue = glass outline, do not cut"), encoding="utf-8")
        (OUT / "W-preview.svg").write_text(doc(f'<path d="{ARCH}" fill="#2E3A52"/><path d="{d}" fill="#FFFFFF" fill-rule="evenodd"/>', "W preview"), encoding="utf-8")
        (OUT / "W-render.svg").unlink(missing_ok=True)
