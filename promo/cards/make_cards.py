"""NARIN greeting cards, A6 (105 x 148 mm) + 3 mm bleed = 111 x 154 mm. 1 unit = 1 mm.
All text is outlined (HarfBuzz shaping + fontTools outlines), so the printer needs no fonts.
Front: a scene + a short Czech line. Back (shared): logo, lines to write on, QR code.
Run: python make_cards.py  ->  out/*.svg (then PDFs via the topdf tool)."""
import math
import pathlib
import re

import segno
import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
SHOP = HERE.parent / "shop"
TW, TH, B = 105, 148, 3
W, H = TW + 2 * B, TH + 2 * B

# NARIN palette (from the label)
COBALT, NAVY, BLUE = "#1C70E3", "#0B3C8C", "#0B4DB5"
RED, CORAL, YELLOW = "#FF3B2F", "#FF7C77", "#FFD84A"
GREEN, MINT = "#2A9A4B", "#19C98A"
PURPLE, LILAC, CREAM = "#8B55F6", "#F3CDF6", "#FFF7EC"

DAISY = (SHOP / "daisy_path.txt").read_text().strip()          # 100 x 100, centred on 0,0
HOLE = "M8.5 0A8.5 8.5 0 1 0 -8.5 0A8.5 8.5 0 1 0 8.5 0Z"
QR_URL = "https://www.instagram.com/"                           # TODO: the shop's real link

FONTS = {}


def font(name):
    if name not in FONTS:
        p = HERE / "fonts" / name
        data = p.read_bytes()
        FONTS[name] = (TTFont(p), hb.Font(hb.Face(data)))
    return FONTS[name]


def text(s, name, size, x, y, fill, anchor="start", tracking=0.0):
    """Shaped, outlined text: baseline y, size = em in mm, tracking in em."""
    tt, hf = font(name)
    upem = tt["head"].unitsPerEm
    buf = hb.Buffer()
    buf.add_str(s)
    buf.guess_segment_properties()
    hb.shape(hf, buf, {"kern": True, "liga": True})
    gs, order = tt.getGlyphSet(), tt.getGlyphOrder()
    k = size / upem
    adv = sum(p.x_advance for p in buf.glyph_positions) + tracking * upem * (len(buf.glyph_infos) - 1)
    x0 = x - {"start": 0, "middle": adv * k / 2, "end": adv * k}[anchor]
    pen = SVGPathPen(gs)
    cx = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        g = order[info.codepoint]
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x0 + (cx + pos.x_offset) * k, y - pos.y_offset * k)))
        cx += pos.x_advance + tracking * upem
    return f'<path fill="{fill}" d="{pen.getCommands()}"/>', adv * k


def daisy(x, y, d, color, rot=0.0, hole=True):
    s = d / 100
    return (f'<path transform="translate({x:.2f} {y:.2f}) rotate({rot:.1f}) scale({s:.4f})" fill="{color}" '
            f'fill-rule="evenodd" d="{DAISY}{" " + HOLE if hole else ""}"/>')


def logo(x, y, w, color=COBALT):
    """The NARIN logo (white letters recoloured), tulips kept in colour. x,y = top-left, w = width in mm."""
    src = (SHOP / "narin_logo_white.svg").read_text()
    body = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", src, flags=re.S).replace('fill="#FEFEFE"', f'fill="{color}"')
    s = w / 1181
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({s:.5f}) translate(-184 -626)">{body}</g>'


def svg(body, title):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" '
            f'viewBox="0 0 {W} {H}"><title>{title}</title>{body}</svg>\n')


def trim_marks():
    """Thin trim guide for the preview only (not in the print files)."""
    return f'<rect x="{B}" y="{B}" width="{TW}" height="{TH}" fill="none" stroke="#FF00FF" stroke-width="0.15" stroke-dasharray="1 1"/>'


# ---------------------------------------------------------------- fronts
# soft pastel palette, closer to the references (NARIN colours only as accents)
P_LIME, P_PINK, P_ROSE, P_BLUSH = "#CFE39A", "#F2A7C3", "#E06C93", "#FBE3EA"
P_SKY, P_SAGE, P_BUTTER, P_IVORY = "#B9D8F4", "#A9C79E", "#F6E7A1", "#FBF6EF"


def blob_flower(x, y, R, n, color, rot=0.0, depth=0.36, stroke=None, sw=0.0):
    """A soft flower silhouette: n round petals (radius modulated by |cos|), smooth closed curve."""
    pts = []
    for i in range(n * 24):
        t = 2 * math.pi * i / (n * 24)
        r = R * (1 - depth + depth * abs(math.cos(n * t / 2)) ** 0.6)
        a = t + math.radians(rot)
        pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    d = "M" + " L".join(f"{px:.2f} {py:.2f}" for px, py in pts) + "Z"
    if stroke:
        return f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>'
    return f'<path d="{d}" fill="{color}"/>'


def small_brand(y, color):
    t, _ = text("NARIN", "Fraunces-SoftSemi.ttf", 3.6, W / 2, y, color, "middle", 0.25)
    return t


def front_krasa():
    """'Krása jsi ty.' (after 'красота — это ты'): lime card, a big soft ivory flower cropped at the edge, pink words in it."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_LIME}"/>',
           blob_flower(B + 74, B + 100, 58, 5, P_IVORY, rot=-8, depth=0.34)]
    t1, _ = text("Krása", "Fraunces-SoftSemi.ttf", 13, B + 76, B + 96, P_ROSE, "middle", -0.01)
    t2, _ = text("jsi ty.", "Fraunces-SoftItalic.ttf", 13, B + 76, B + 110, P_ROSE, "middle", -0.01)
    t3, _ = text("NARIN", "Fraunces-SoftSemi.ttf", 9, B + 9, B + 17, P_IVORY, tracking=0.12)
    return "".join(out + [t1, t2, t3])


def front_svet():
    """'Svět je s tebou barevnější.' (after 'ты делаешь мир ярче'): blush card, little outlined flowers, centred serif."""
    import random
    rnd = random.Random(4)
    out = [f'<rect width="{W}" height="{H}" fill="{P_BLUSH}"/>']
    spots = [(14, 18, 9), (90, 16, 6), (106, 44, 11), (8, 62, 5), (34, 40, 3.5), (78, 52, 3), (22, 98, 7), (96, 104, 4.5),
             (60, 126, 9), (12, 138, 5.5), (100, 140, 8), (44, 112, 3), (72, 24, 3.5), (30, 150, 4)]
    cols = [P_ROSE, "#E9C44E", P_SAGE, P_PINK]
    for i, (x, y, r) in enumerate(spots):
        c = cols[i % len(cols)]
        out.append(blob_flower(x + B, y + B, r, 8, None, rot=rnd.uniform(0, 45), depth=0.32, stroke=c, sw=max(0.35, r * 0.07)))
        out.append(blob_flower(x + B, y + B, r * 0.28, 8, None, stroke=c, sw=max(0.3, r * 0.05), depth=0.25))
    y = B + 64
    for txt in ("Svět", "je s tebou", "barevnější"):
        t, _ = text(txt.upper(), "Fraunces-SoftRegular.ttf", 10.3, W / 2, y, P_ROSE, "middle", 0.02)
        out.append(t)
        y += 11.5
    out.append(small_brand(B + TH - 8, P_ROSE))
    return "".join(out)


# ---------------------------------------------------------------- back (shared)
def qr(x, y, size, url=QR_URL, color=NAVY):
    q = segno.make(url, error="m")
    m = q.matrix
    n = len(m)
    c = size / n
    d = "".join(f"M{x + j * c:.3f} {y + i * c:.3f}h{c:.3f}v{c:.3f}h{-c:.3f}Z" for i, row in enumerate(m) for j, v in enumerate(row) if v)
    return f'<path fill="{color}" d="{d}"/>'


def back():
    """Plain back: the whole upper part left empty (for a printed or a handwritten message), small logo + QR at the bottom."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_IVORY}"/>']
    qs = 15
    qy = B + TH - 9 - qs
    out.append(logo(B + 9, qy + 2, 34, COBALT))
    out.append(qr(B + TW - 9 - qs, qy, qs, color=NAVY))
    c, _ = text("květiny & dárky · Praha", "Fraunces-SoftItalic.ttf", 3.3, B + 9, qy + 15, NAVY)
    out.append(c)
    return "".join(out)


CARDS = {"01-krasa-jsi-ty": front_krasa, "02-svet-je-s-tebou-barevnejsi": front_svet}


def main():
    OUT.mkdir(exist_ok=True)
    (OUT / "zadni-strana.svg").write_text(svg(back(), "NARIN card back, A6 + 3 mm bleed"), encoding="utf-8")
    for name, fn in CARDS.items():
        (OUT / f"{name}.svg").write_text(svg(fn(), f"NARIN card {name}, A6 + 3 mm bleed"), encoding="utf-8")
    print("cards", len(CARDS))


if __name__ == "__main__":
    main()
