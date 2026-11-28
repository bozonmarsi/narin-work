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


# ---------------------------------------------------------------- more fronts (after the references)
P_CORAL, P_SALMON, P_CREAM2, P_PEACH = "#E8968A", "#F4C3B6", "#F6E6D4", "#F3B7A6"
P_SKYDEEP, P_COBALT2, P_HOT, P_LAV = "#7FB2EA", "#4F46C8", "#E9408F", "#C9B5F0"


def lines_c(rows, y0, step, font_name, size, color, x=None, anchor="middle", tracking=0.0):
    out, y = [], y0
    for r in rows:
        t, _ = text(r, font_name, size, W / 2 if x is None else x, y, color, anchor, tracking)
        out.append(t)
        y += step
    return "".join(out)


def five(x, y, R, color, center=None, rot=0.0):
    """Five round petals + a dot (the reference's simple white flower)."""
    out = [blob_flower(x, y, R, 5, color, rot=rot, depth=0.42)]
    if center:
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{R * 0.2:.2f}" fill="{center}"/>')
    return "".join(out)


def star(x, y, R, n, color, rot=0.0, inner=0.22):
    pts = []
    for i in range(2 * n):
        r = R if i % 2 == 0 else R * inner
        a = math.radians(rot) + math.pi * i / n
        pts.append((x + r * math.sin(a), y - r * math.cos(a)))
    return f'<path fill="{color}" d="M' + " L".join(f"{px:.2f} {py:.2f}" for px, py in pts) + 'Z"/>'


def wave_band(points, width, color):
    d = "M" + " ".join(f"{x:.1f} {y:.1f}" if i == 0 else f"{x:.1f} {y:.1f}" for i, (x, y) in enumerate(points[:1]))
    for i in range(1, len(points) - 1):
        (x1, y1), (x2, y2) = points[i], points[i + 1]
        d += f" Q{x1:.1f} {y1:.1f} {(x1 + x2) / 2:.1f} {(y1 + y2) / 2:.1f}"
    d += f" L{points[-1][0]:.1f} {points[-1][1]:.1f}"
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'


def front_miluj():
    """'Miluj. Tvoř. Sni.' (люби, твори, мечтай): salmon card, fat cream ribbons, coral serif."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_SALMON}"/>']
    out.append(wave_band([(-10, 12), (20, -4), (40, 30), (62, 8), (88, 26), (122, 2)], 9, P_CREAM2))
    out.append(wave_band([(120, 40), (96, 52), (106, 80), (126, 92)], 9, P_CREAM2))
    out.append(wave_band([(-8, 118), (16, 104), (30, 136), (54, 122), (70, 160)], 9, P_CREAM2))
    out.append(wave_band([(84, 162), (92, 132), (118, 128)], 9, P_CREAM2))
    out.append(lines_c(["Miluj.", "Tvoř.", "Sni."], B + 62, 17, "Fraunces-SoftSemi.ttf", 17, "#D2564F", tracking=-0.01))
    out.append(small_brand(B + TH - 7, "#D2564F"))
    return "".join(out)


def front_nejlepsi():
    """'To nejlepší teprve přijde.' (лучшие дни ещё впереди): coral card, three white flowers."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_CORAL}"/>']
    out.append(lines_c(["To nejlepší"], B + 28, 0, "Fraunces-SoftItalic.ttf", 10, P_IVORY))
    for x, y, R, rot in ((44, 68, 15, 8), (74, 86, 13, -12), (46, 104, 11, 20)):
        out.append(five(B + x, B + y, R, P_IVORY, "#B5544A", rot))
    out.append(lines_c(["teprve přijde."], B + 134, 0, "Fraunces-SoftItalic.ttf", 10, P_IVORY))
    out.append(small_brand(B + TH - 6, P_IVORY))
    return "".join(out)


def front_zar():
    """'Zář.' (сияй): sage card, big soft white word in an oval, a little four-point star."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_SAGE}"/>']
    out.append(f'<ellipse cx="{W / 2:.1f}" cy="{B + 78:.1f}" rx="40" ry="34" fill="none" stroke="{P_IVORY}" stroke-width="1"/>')
    t, _ = text("Zař.", "Fraunces-SoftBlack.ttf", 34, W / 2, B + 90, P_IVORY, "middle", -0.03)
    out.append(t)
    out.append(star(B + 82, B + 44, 6, 4, P_IVORY, inner=0.25))
    out.append(star(B + 90, B + 38, 2.6, 4, P_IVORY, inner=0.3))
    out.append(small_brand(B + TH - 8, P_IVORY))
    return "".join(out)


def front_usmev():
    """'Úsměv ti sluší.' (улыбайся — тебе так идёт): ivory card, sky-blue flowers tumbling from the top."""
    import random
    rnd = random.Random(9)
    out = [f'<rect width="{W}" height="{H}" fill="{P_IVORY}"/>']
    for x, y, R in ((6, 8, 14), (34, 4, 11), (62, 12, 15), (94, 2, 13), (112, 26, 12), (18, 34, 12), (48, 38, 9),
                    (80, 40, 13), (2, 62, 10), (34, 66, 8), (64, 64, 11), (100, 64, 9), (20, 88, 6), (86, 88, 7), (54, 90, 5)):
        out.append(blob_flower(x, y, R, 5, P_SKY, rot=rnd.uniform(0, 70), depth=0.38))
    out.append(lines_c(["Úsměv", "ti sluší."], B + 118, 11, "Fraunces-SoftSemi.ttf", 11, P_ROSE, tracking=-0.01))
    out.append(small_brand(B + TH - 6, P_ROSE))
    return "".join(out)


def wavy_rect(x0, y0, x1, y1, amp, n_x, n_y):
    pts = []
    for i in range(n_x * 20 + 1):
        t = i / (n_x * 20); pts.append((x0 + (x1 - x0) * t, y0 + amp * math.sin(t * n_x * 2 * math.pi)))
    for i in range(1, n_y * 20 + 1):
        t = i / (n_y * 20); pts.append((x1 + amp * math.sin(t * n_y * 2 * math.pi), y0 + (y1 - y0) * t))
    for i in range(1, n_x * 20 + 1):
        t = i / (n_x * 20); pts.append((x1 - (x1 - x0) * t, y1 - amp * math.sin(t * n_x * 2 * math.pi)))
    for i in range(1, n_y * 20):
        t = i / (n_y * 20); pts.append((x0 - amp * math.sin(t * n_y * 2 * math.pi), y1 - (y1 - y0) * t))
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "Z"


def front_vic():
    """'Víc než jen květiny.' (more than just flowers): pink card, a wavy cream window, the line in the middle."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_PINK}"/>',
           f'<path fill="{P_IVORY}" d="{wavy_rect(B + 10, B + 12, B + TW - 10, B + TH - 12, 2.6, 6, 9)}"/>']
    t1, _ = text("VÍC NEŽ JEN", "Fraunces-SoftRegular.ttf", 6.6, W / 2, B + 72, P_ROSE, "middle", 0.06)
    t2, _ = text("květiny", "Fraunces-SoftItalic.ttf", 15, W / 2, B + 87, P_ROSE, "middle", -0.01)
    out += [t1, t2, small_brand(B + TH - 22, P_ROSE)]
    return "".join(out)


def stem(x0, y0, x1, y1, bend, w=3.2, col="#2A9A4B"):
    return (f'<path d="M{x0:.1f} {y0:.1f} C{x0 + bend:.1f} {y0 - (y0 - y1) * 0.35:.1f} {x1 - bend * 0.6:.1f} {y1 + (y0 - y1) * 0.4:.1f} {x1:.1f} {y1:.1f}" '
            f'fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>')


def front_laska():
    """'Láska k sobě nepotřebuje důvod.' (для любви к себе не нужен повод): indigo card, buttercups on soft stems."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_COBALT2}"/>']
    out.append(lines_c(["Láska k sobě", "nepotřebuje", "důvod."], B + 26, 10.5, "Fraunces-SoftItalic.ttf", 10, P_IVORY))
    for x, y, bend, col in ((14, 92, 8, "#9CCB8C"), (36, 110, -6, "#5DAA6A"), (58, 86, 10, "#9CCB8C"), (80, 116, -8, "#5DAA6A"), (98, 96, 6, "#9CCB8C")):
        out.append(stem(B + x - bend * 0.5, H + 2, B + x, B + y + 4, bend, 3.4, col))
        out.append(blob_flower(B + x, B + y - 1, 7.5, 5, "#FBEA8C", rot=-90, depth=0.5))
        out.append(f'<path d="M{B + x - 6:.1f} {B + y + 1:.1f} Q{B + x:.1f} {B + y + 8:.1f} {B + x + 6:.1f} {B + y + 1:.1f}" fill="#B9D77C"/>')
        out.append(f'<circle cx="{B + x:.1f}" cy="{B + y - 1:.1f}" r="1.6" fill="{P_COBALT2}"/>')
    return "".join(out)


def front_jedinecna():
    """'Jsi jedinečná.' (ты уникальна): ivory card, hot-pink panel with big butter-yellow abstract flowers."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_IVORY}"/>',
           f'<defs><clipPath id="panel"><rect x="{B + 9}" y="{B + 10}" width="{TW - 18}" height="{TH - 46}"/></clipPath></defs>',
           f'<rect x="{B + 9}" y="{B + 10}" width="{TW - 18}" height="{TH - 46}" fill="{P_HOT}"/>',
           '<g clip-path="url(#panel)">']
    for x, y, R, rot in ((28, 30, 24, 10), (80, 46, 22, 40), (34, 82, 20, -20), (82, 98, 24, 15)):
        out.append(blob_flower(B + x, B + y, R, 4, "#F4F08A", rot=rot, depth=0.55))
        out.append(f'<ellipse cx="{B + x + 3:.1f}" cy="{B + y - 4:.1f}" rx="2.2" ry="1.2" fill="#FFFFFF" transform="rotate(-20 {B + x + 3:.1f} {B + y - 4:.1f})"/>')
    out.append("</g>")
    out.append(lines_c(["Jsi jedinečná."], B + TH - 18, 0, "Fraunces-SoftSemi.ttf", 11.5, P_HOT, tracking=-0.01))
    out.append(small_brand(B + TH - 8, P_HOT))
    return "".join(out)


def front_sny():
    """'Tvé sny se splní. Uvidíš.' (твои мечты обязательно сбудутся): blush card, two brush-like rose lines."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_BLUSH}"/>']
    for off, w in ((0, 0.9), (1.4, 0.5), (-1.2, 0.4)):
        out.append(wave_band([(-4, 14 + off), (30, 6 + off), (60, 34 + off), (96, 26 + off), (118, 40 + off)], w, "#C9708F"))
        out.append(wave_band([(-4, 112 + off), (16, 106 + off), (26, 128 + off), (34, 160 + off)], w, "#C9708F"))
        out.append(wave_band([(118, 96 + off), (96, 104 + off), (88, 128 + off), (100, 160 + off)], w, "#C9708F"))
    out.append(lines_c(["TVÉ SNY", "SE SPLNÍ."], B + 64, 12.5, "Fraunces-SoftRegular.ttf", 11, "#B0436E", tracking=0.03))
    out.append(lines_c(["Uvidíš."], B + 92, 0, "Fraunces-SoftItalic.ttf", 9, "#B0436E"))
    out.append(small_brand(B + TH - 7, "#B0436E"))
    return "".join(out)


def front_jaro():
    """'Brzy jaro, brzy láska.' (скоро любовь, скоро весна): pink card, big butter outlined flowers, right-aligned serif."""
    out = [f'<rect width="{W}" height="{H}" fill="#F7C9D2"/>']
    out.append(blob_flower(B + 84, B - 4, 26, 8, None, rot=8, depth=0.3, stroke="#FBF0A6", sw=1.6))
    out.append(blob_flower(B - 2, B + 116, 34, 8, None, rot=-6, depth=0.3, stroke="#FBF0A6", sw=1.8))
    out.append(lines_c(["brzy jaro,", "brzy láska."], B + 66, 13, "Fraunces-SoftRegular.ttf", 12, "#C2476E", x=B + TW - 10, anchor="end"))
    out.append(lines_c(["Fakt."], B + 96, 0, "Fraunces-SoftItalic.ttf", 12, "#C2476E", x=B + TW - 10, anchor="end"))
    out.append(small_brand(B + TH - 7, "#C2476E"))
    return "".join(out)


def front_dopadne():
    """'Všechno dobře dopadne.' (всё точно получится): sky-blue card, a big hand-drawn white flower outline."""
    out = [f'<rect width="{W}" height="{H}" fill="{P_SKYDEEP}"/>']
    out.append(blob_flower(B + 30, B + 66, 62, 5, None, rot=14, depth=0.4, stroke=P_IVORY, sw=1.6))
    out.append(lines_c(["Všechno", "dobře dopadne."], B + 76, 12, "Fraunces-SoftSemi.ttf", 10.5, P_IVORY, tracking=-0.01))
    out.append(f'<path d="M{W / 2 - 4:.1f} {B + 97:.1f} Q{W / 2 + 10:.1f} {B + 94:.1f} {W / 2 + 26:.1f} {B + 97:.1f}" fill="none" stroke="{P_IVORY}" stroke-width="0.8" stroke-linecap="round"/>')
    out.append(small_brand(B + TH - 7, P_IVORY))
    return "".join(out)


# ---------------------------------------------------------------- cute illustrated fronts
import cute as C

PAPER = "#FBF6EC"


def hand_lines(rows, y0, step, size, color, x=None, anchor="middle", font_name="Caveat-SemiBold.ttf", tracking=0.0):
    return lines_c(rows, y0, step, font_name, size, color, x=x, anchor=anchor, tracking=tracking)


def front_zvladnes():
    """'Ty to zvládneš!' (у тебя всё получится): pink crayon square, a party cat with a star wand."""
    out = [f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
           C.scribble_rect(B + 10, B + 14, B + TW - 10, B + 104, ["#F4A0C0", "#F07DAA", "#F8C0D4"], seed=5, w=1.6)]
    out.append(C.party_cat(B + 48, B + 82, 0.95))
    out.append(hand_lines(["Ty to zvládneš!"], B + 124, 0, 13, C.NAVY_INK))
    out.append(small_brand(B + TH - 9, C.NAVY_INK))
    return "".join(out)


def front_fajn():
    """'Přeju ti všechno, co je fajn. A nic, co fajn není.' (желаю всего самого прикольного...): pencil cat with a red hat."""
    out = [f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
    out.append(hand_lines(["PŘEJU TI VŠECHNO,", "CO JE FAJN.", "A NIC,", "CO FAJN NENÍ."], B + 20, 9.5, 9, C.BROWN_INK,
                          font_name="Caveat-Medium.ttf", tracking=0.06))
    out.append(C.sketch_cat2(B + 46, B + 88, 0.76))
    t, _ = text("NARIN", "Fraunces-SoftSemi.ttf", 3.6, B + TW - 8, B + TH - 7, C.BROWN_INK, "end", 0.25)
    out.append(t)
    return "".join(out)


def front_narozeniny():
    """'Všechno nejlepší! A zař ještě víc.' (с днём рождения, сияй ярче): red ribbon frame, a heart with eyes."""
    red = "#D2373E"
    out = [f'<rect width="{W}" height="{H}" fill="#F7F1DA"/>', C.ribbon_frame(B + 9, B + 12, B + TW - 9, B + TH - 12, red)]
    out.append(hand_lines(["Všechno", "nejlepší!"], B + 38, 12, 14, red))
    out.append(C.face_heart(W / 2, B + 82, 21, red))
    out.append(hand_lines(["a zař ještě víc"], B + 120, 0, 11.5, red))
    return "".join(out)


def front_pro_tebe():
    """'To je pro tebe.' (это тебе): a big soft heart held up by a little frog."""
    out = [f'<rect width="{W}" height="{H}" fill="#F6F2E6"/>']
    hx, hy, hs = B + 56, B + 64, 44
    out.append(f'<path d="{C.smooth(C.heart_pts(hx, hy, hs, 90))}" fill="#D3656F"/>')
    out.append(hand_lines(["to je pro tebe"], hy + 2, 0, 11, "#3A2A2A", font_name="Caveat-Medium.ttf"))
    fr, hand = C.frog(B + 21, B + 117, 1.05, reach=(hx, hy + 1.0625 * hs - 1))
    out.append(fr)
    out.append(small_brand(B + TH - 7, "#7A6A5A"))
    return "".join(out)


def front_stesti():
    """'Jaké štěstí, že tě mám!' (какое счастье, что ты есть в моей жизни): a crayon heart, someone cuddling it from the side."""
    out = [f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>']
    hx, hy, hs = B + 40, B + 74, 35
    body, arm = C.side_hugger(hx, hy, hs)
    hd = C.smooth(C.heart_pts(hx, hy, hs, 90))
    out.append(C.crayon("heartc", hd, "#D92A22", ["#C8211B", "#E5372E", "#B81C17", "#EE4A3E"], hx - hs, hy - hs, hx + hs, hy + hs, seed=3, w=1.0, n=520))
    out.append(hand_lines(["JAKÉ", "ŠTĚSTÍ,", "ŽE TĚ", "MÁM!"], hy - 8.5, 8.4, 8.2, "#FFFFFF", font_name="Caveat-Medium.ttf", x=hx - 5, tracking=0.06))
    out.append(body)
    out.append(arm)
    out.append(small_brand(B + TH - 6, "#888888"))
    return "".join(out)


import random


def front_laska_big():
    """'Mám s tebou velké štěstí.' over giant pink LÁSKA (after the big 'ЛЮБОВЬ' card); the last letter is a heart."""
    pink, red = "#F78BAA", "#D7222E"
    out = [f'<rect width="{W}" height="{H}" fill="#FBF8F6"/>']
    rows = [("LÁ", B + 47), ("SK", B + 98)]
    for txt, y in rows:
        _, wdt = text(txt, "Fraunces-SoftBlack.ttf", 62, 0, 0, pink, "start", -0.04)
        k = (W + 8) / wdt
        t, _ = text(txt, "Fraunces-SoftBlack.ttf", 62, 0, 0, pink, "start", -0.04)
        out.append(f'<g transform="translate(-4 {y:.1f}) scale({k:.3f} 1)">{t}</g>')
    a, aw = text("A", "Fraunces-SoftBlack.ttf", 62, 0, 0, pink, "start")
    out.append(f'<g transform="translate(-2 {B + 150:.1f}) scale({(W * 0.52) / aw:.3f} 1)">{a}</g>')
    hx, hy, hs = W * 0.76, B + 126, 20
    out.append(f'<path d="{C.smooth(C.heart_pts(hx, hy, hs, 90))}" fill="none" stroke="{pink}" stroke-width="7.5" stroke-linejoin="round"/>')
    t1, _ = text("Mám s tebou", "GreatVibes-Regular.ttf", 12.5, W / 2 + 2, B + 70, red, "middle")
    t2, _ = text("velké štěstí", "GreatVibes-Regular.ttf", 12.5, W / 2 + 6, B + 82, red, "middle")
    out += [t1, t2]
    return "".join(out)


def front_doma():
    """'S tebou jsem doma.' (с тобой я как дома): two kittens cuddling inside a red heart outline, on pink."""
    red = "#D3263A"
    rnd = random.Random(5)
    out = [f'<rect width="{W}" height="{H}" fill="#F8CCD3"/>']
    out.append(C.outline_heart(W / 2, B + 60, 47, red, 0.75, rnd, amt=0.25))
    out.append(C.cuddling_cats(W / 2, B + 52, 1.15))
    out.append(lines_c(["S TEBOU", "JSEM DOMA."], B + 122, 11, "Fraunces-SoftRegular.ttf", 9.5, red, tracking=0.04))
    out.append(small_brand(B + TH - 6, red))
    return "".join(out)


def front_husa():
    """'Zlato, poslouchej svoje srdce.' (милая, слушай своё сердце): a white goose on deep red, little hearts."""
    out = [f'<rect width="{W}" height="{H}" fill="#9B1C2C"/>']
    out.append(lines_c(["Zlato,", "poslouchej svoje srdce."], B + 30, 9.5, "Comfortaa-Regular.ttf", 7.2, "#F6EFE6"))
    out.append(C.goose(B + 66, B + 86, 1.0))
    rnd = random.Random(2)
    for (x, y, s) in ((B + 32, B + 64, 3.4), (B + 37, B + 80, 2.6), (B + 84, B + 56, 2.4), (B + 92, B + 72, 3.6)):
        out.append(C.outline_heart(x, y, s, "#F6EFE6", 0.35, rnd))
    t, _ = text("NARIN", "Fraunces-SoftSemi.ttf", 3.6, B + TW - 8, B + TH - 7, "#F6EFE6", "end", 0.25)
    out.append(t)
    return "".join(out)


def front_slunce():
    """'S tebou mi v duši vždycky svítí slunce.' (когда я с тобой, в моей душе солнце всегда светит ярко): a blue postage stamp."""
    yellow = "#F7F08A"
    out = [f'<rect width="{W}" height="{H}" fill="#FBF8F2"/>',
           f'<path d="{C.stamp_path(B + 6, B + 8, B + TW - 6, B + TH - 14)}" fill="#7DA6EC"/>']
    t0, _ = text("(k Valentýnu!)", "GreatVibes-Regular.ttf", 5.2, W / 2, B + 20, yellow, "middle")
    out.append(t0)
    for txt, y in (("S TEBOU MI", B + 34), ("V DUŠI", B + 44)):
        t, w = text(txt, "Fraunces-SoftSemi.ttf", 11, 0, 0, yellow, "start", 0.01)
        out.append(f'<g transform="translate({W / 2 - w * 0.72 / 2:.2f} {y:.2f}) scale(0.72 1)">{t}</g>')
    out.append(C.sun_burst(W / 2, B + 78, 20))
    t, w = text("VŽDYCKY SVÍTÍ", "Fraunces-SoftSemi.ttf", 11, 0, 0, yellow, "start", 0.01)
    out.append(f'<g transform="translate({B + TW - 12 - w * 0.72:.2f} {B + 113:.2f}) scale(0.72 1)">{t}</g>')
    t2, _ = text("slunce", "GreatVibes-Regular.ttf", 15, B + 18, B + 126, yellow)
    out.append(t2)
    out.append(small_brand(B + TH - 6, "#4E6FB8"))
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


CARDS = {"01-krasa-jsi-ty": front_krasa, "02-svet-je-s-tebou-barevnejsi": front_svet,
         "03-miluj-tvor-sni": front_miluj, "04-to-nejlepsi-teprve-prijde": front_nejlepsi, "05-zar": front_zar,
         "06-usmev-ti-slusi": front_usmev, "07-vic-nez-jen-kvetiny": front_vic, "08-laska-k-sobe": front_laska,
         "09-jsi-jedinecna": front_jedinecna, "10-tve-sny-se-splni": front_sny, "11-brzy-jaro-brzy-laska": front_jaro,
         "12-vsechno-dobre-dopadne": front_dopadne,
         "13-ty-to-zvladnes": front_zvladnes, "14-preju-ti-vsechno-fajn": front_fajn, "15-vsechno-nejlepsi": front_narozeniny,
         "16-to-je-pro-tebe": front_pro_tebe, "17-jake-stesti-ze-te-mam": front_stesti,
         "18-mam-s-tebou-velke-stesti": front_laska_big, "19-s-tebou-jsem-doma": front_doma,
         "20-zlato-poslouchej-srdce": front_husa, "21-v-dusi-mi-sviti-slunce": front_slunce}


def main():
    OUT.mkdir(exist_ok=True)
    (OUT / "zadni-strana.svg").write_text(svg(back(), "NARIN card back, A6 + 3 mm bleed"), encoding="utf-8")
    for name, fn in CARDS.items():
        (OUT / f"{name}.svg").write_text(svg(fn(), f"NARIN card {name}, A6 + 3 mm bleed"), encoding="utf-8")
    print("cards", len(CARDS))


if __name__ == "__main__":
    main()
