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
def front_krasa():
    """'Krása jsi ty.' One huge red label daisy rising from the corner, deep blue serif on lilac."""
    out = [f'<rect width="{W}" height="{H}" fill="{LILAC}"/>',
           daisy(B + 80, B + 146, 150, RED, 8)]
    t1, _ = text("Krása", "Fraunces-SoftBlack.ttf", 30, B + 8, B + 37, NAVY, tracking=-0.02)
    t2, _ = text("jsi ty.", "Fraunces-SoftItalic.ttf", 30, B + 9, B + 63, NAVY, tracking=-0.01)
    out += [t1, t2]
    t3, _ = text("NARIN · KVĚTINY & DÁRKY", "Ubuntu-Medium.ttf", 2.8, B + 9, B + 11, NAVY, tracking=0.12)
    out.append(t3)
    return "".join(out)


def stem(x0, y0, x1, y1, bend, w=3.2, col=GREEN):
    return (f'<path d="M{x0:.1f} {y0:.1f} C{x0 + bend:.1f} {y0 - (y0 - y1) * 0.35:.1f} {x1 - bend * 0.6:.1f} {y1 + (y0 - y1) * 0.4:.1f} {x1:.1f} {y1:.1f}" '
            f'fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>')


def leaf(x, y, L, ang, col):
    w = L * 0.38
    return (f'<path transform="translate({x:.1f} {y:.1f}) rotate({ang:.1f})" fill="{col}" '
            f'd="M0 0 C{L * .25:.1f} {-w:.1f} {L * .8:.1f} {-w:.1f} {L:.1f} 0 C{L * .8:.1f} {w:.1f} {L * .25:.1f} {w:.1f} 0 0Z"/>')


def front_svet():
    """'Svět je s tebou barevnější.' Five label daisies on tall swaying stems on the brand blue."""
    out = [f'<rect width="{W}" height="{H}" fill="{COBALT}"/>']
    base = H + 2
    flowers = [(16, 104, 26, YELLOW, 10, -6), (38, 78, 31, LILAC, -10, 5), (58, 112, 24, RED, 4, -8),
               (78, 86, 30, "#FFFFFF", 12, 7), (98, 116, 22, YELLOW, -6, 4)]
    stems, leaves, heads = [], [], []
    for x, y, d, col, bend, rot in flowers:
        sx = x - bend * 0.5
        stems.append(stem(sx, base, x, y + d * 0.2, bend))
        ly = y + (base - y) * 0.55
        leaves.append(leaf(sx + bend * 0.35, ly, 13, -35 if bend > 0 else -145, MINT))
        heads.append(daisy(x, y, d, col, rot))
    out += stems + leaves + heads
    t1, _ = text("Svět je s tebou", "Fraunces-SoftItalic.ttf", 12.5, W / 2, B + 27, "#FFFFFF", "middle", -0.01)
    t2, _ = text("barevnější.", "Fraunces-SoftBlack.ttf", 17, W / 2, B + 45, "#FFFFFF", "middle", -0.02)
    out += [t1, t2]
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
    out = [f'<rect width="{W}" height="{H}" fill="{CREAM}"/>']
    out.append(logo(W / 2 - 26, B + 12, 52, COBALT))
    # writing area
    left, right = B + 10, B + TW - 10
    y0 = B + 40
    lab, _ = text("Pro", "Fraunces-SoftItalic.ttf", 5, left, y0, NAVY)
    out.append(lab)
    for i in range(5):
        yy = y0 + 1.5 + i * 11
        out.append(f'<line x1="{left + (9 if i == 0 else 0):.1f}" y1="{yy:.1f}" x2="{right:.1f}" y2="{yy:.1f}" stroke="{NAVY}" stroke-opacity="0.35" stroke-width="0.25"/>')
    od_y = y0 + 1.5 + 4 * 11 + 11
    lab2, _ = text("Od", "Fraunces-SoftItalic.ttf", 5, right - 40, od_y - 1.5, NAVY)
    out.append(lab2)
    out.append(f'<line x1="{right - 33:.1f}" y1="{od_y:.1f}" x2="{right:.1f}" y2="{od_y:.1f}" stroke="{NAVY}" stroke-opacity="0.35" stroke-width="0.25"/>')
    # footer: QR + line
    qs = 17
    qy = B + TH - 10 - qs
    out.append(qr(left, qy, qs))
    c1, _ = text("Kytice, které", "Fraunces-SoftItalic.ttf", 4.2, left + qs + 5, qy + 7, NAVY)
    c2, _ = text("udělají radost.", "Fraunces-SoftItalic.ttf", 4.2, left + qs + 5, qy + 12.5, NAVY)
    c3, _ = text("NARIN · PRAHA", "Ubuntu-Medium.ttf", 2.6, left + qs + 5, qy + 17, COBALT, tracking=0.12)
    out += [c1, c2, c3]
    out.append(daisy(right - 7, qy + 9.5, 14, COBALT, 12))
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
