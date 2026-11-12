"""Shop-front graphics for NARIN as print-ready SVG (1 user unit = 1 mm, text outlined).

    python3 make_svgs.py <Ubuntu-Medium.ttf> [out_dir]

Sizes come from the entrance plan (plan_pomeshchenie_i_dver.pdf, 12.11.2026):
arch glass 144 x 70 cm, door 155 = 73 + 7 + 75, a 28 x 100 cm window in each leaf (bottom ~90 cm above the floor),
a 50 cm band over the door, total height ~365 cm.
"""
import math
import pathlib
import random
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).parent
FONT = TTFont(sys.argv[1])
OUT = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else HERE
OUT.mkdir(parents=True, exist_ok=True)

# label colours
BLUE, RED, YELLOW, GREEN, PURPLE, LILAC = "#0B4DB5", "#FF3B2F", "#FFD84A", "#2A9A4B", "#8B55F6", "#F3CDF6"
COBALT, WHITE = "#1C70E3", "#FFFFFF"
DAISY_COLS = [BLUE, RED, YELLOW, GREEN, PURPLE, LILAC]

DAISY = (HERE / "daisy_path.txt").read_text().strip()        # 100 x 100, centred on 0,0
HOLE = "M8.5 0A8.5 8.5 0 1 0 -8.5 0A8.5 8.5 0 1 0 8.5 0Z"   # the white hole of the label daisy

logo_src = (HERE / "narin_logo_white.svg").read_text()
LOGO_VB = (184, 626, 1181, 317)
LOGO_BODY = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", logo_src, flags=re.S)


# ---------- helpers ----------
def daisy(x, y, d, color, rot=0.0, hole=True):
    s = d / 100
    return (f'<path transform="translate({x:.1f} {y:.1f}) rotate({rot:.1f}) scale({s:.4f})" fill="{color}" '
            f'fill-rule="evenodd" d="{DAISY}{" " + HOLE if hole else ""}"/>')


def text_path(text, size, x, y, fill, anchor="middle", tracking=0.0, width=None):
    """Outline `text` with the font: baseline at y, `tracking` in em, or stretched to `width` mm."""
    gs, cmap, hmtx = FONT.getGlyphSet(), FONT.getBestCmap(), FONT["hmtx"]
    upm = FONT["head"].unitsPerEm
    k = size / upm
    names = [cmap[ord(ch)] for ch in text]
    adv = [hmtx[n][0] * k for n in names]
    if width is not None and len(text) > 1:
        tracking = (width - sum(adv)) / (len(text) - 1) / size
    total = sum(adv) + tracking * size * (len(text) - 1)
    cx = x - total / 2 if anchor == "middle" else x - total if anchor == "end" else x
    parts = []
    for n, a in zip(names, adv):
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (k, 0, 0, -k, cx, y)))
        if pen.getCommands():
            parts.append(pen.getCommands())
        cx += a + tracking * size
    return f'<path fill="{fill}" d="{" ".join(parts)}"/>', total


def logo(cx, top, width, color=WHITE):
    """The NARIN wordmark scaled to `width` mm; letters recoloured, tulip kept."""
    s = width / LOGO_VB[2]
    body = LOGO_BODY.replace('fill="#FEFEFE"', f'fill="{color}"')
    x, y = cx - width / 2, top
    return (f'<g transform="translate({x:.1f} {y:.1f}) scale({s:.5f}) translate({-LOGO_VB[0]} {-LOGO_VB[1]})">{body}</g>',
            LOGO_VB[3] * s)


def scatter(inside, blocked, n_try, rmin, rmax, gap, seed):
    """Poisson-style dart throwing: daisies of radius rmin..rmax inside a shape, away from blocked boxes."""
    rnd = random.Random(seed)
    placed = []
    for _ in range(n_try):
        r = rnd.uniform(rmin, rmax)
        x, y = rnd.uniform(0, 1), rnd.uniform(0, 1)
        x, y = inside["x0"] + x * (inside["x1"] - inside["x0"]), inside["y0"] + y * (inside["y1"] - inside["y0"])
        if not inside["test"](x, y, r):
            continue
        if any(bx0 - r < x < bx1 + r and by0 - r < y < by1 + r for bx0, by0, bx1, by1 in blocked):
            continue
        if any(math.hypot(x - px, y - py) < r + pr + gap for px, py, pr in placed):
            continue
        placed.append((x, y, r))
    cols = DAISY_COLS[:]
    out = []
    for i, (x, y, r) in enumerate(sorted(placed, key=lambda p: (p[1], p[0]))):
        out.append(daisy(x, y, 2 * r, cols[i % len(cols)], rnd.uniform(0, 45)))
    return out


def svg(w, h, body, title, vb=None):
    vb = vb or f"0 0 {w} {h}"
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
            f'width="{w}mm" height="{h}mm" viewBox="{vb}">\n<title>{title}</title>\n{body}\n</svg>\n')


def layer(name, items):
    return f'<g id="{name}" inkscape:groupmode="layer" inkscape:label="{name}">\n' + "\n".join(items) + "\n</g>"


# ---------- arch (glass 1440 x 700) ----------
AW, AH = 1440, 700
ARCH = f"M0 {AH} A{AW / 2} {AH} 0 0 1 {AW} {AH} Z"


def arch_inner(x, y, r, margin=28):
    rx, ry = AW / 2 - margin - r, AH - margin - r
    return y < AH - margin - r and ((x - AW / 2) / rx) ** 2 + ((y - AH) / ry) ** 2 < 1


def arch_art(ink):
    logo_w = 800
    lg, lh = logo(AW / 2, 175, logo_w, ink)
    sub, _ = text_path("květinový ateliér", 74, AW / 2, 175 + lh + 92, ink, width=logo_w)
    line, lw = text_path("Květiny · Dárky · Pokojovky", 60, AW / 2, 625, ink, tracking=0.08)
    blocked = [(AW / 2 - logo_w / 2 - 20, 110, AW / 2 + logo_w / 2 + 20, 175 + lh + 120),
               (AW / 2 - lw / 2 - 25, 560, AW / 2 + lw / 2 + 25, 650)]
    box = {"x0": 0, "x1": AW, "y0": 0, "y1": AH, "test": arch_inner}
    flowers = scatter(box, blocked, 60000, 22, 44, 20, seed=11)
    return [layer("daisies", flowers), layer("logo", [lg]), layer("text", [sub, line])]


def arch_decal(ink, name):
    guide = layer("cut-guide (do not print)", [f'<path d="{ARCH}" fill="none" stroke="#FF00FF" stroke-width="0.5"/>'])
    return svg(AW, AH, "\n".join([guide] + arch_art(ink)), f"NARIN: arch glass decal 144 x 70 cm ({name})")


def arch_mock(ink):
    pad, frame = 120, 55
    W, H = AW + 2 * pad, AH + pad + 40
    outer = f"M{pad - frame} {pad + AH} A{AW / 2 + frame} {AH + frame} 0 0 1 {pad + AW + frame} {pad + AH} Z"
    parts = [f'<rect width="{W}" height="{H}" fill="#2F6FD8"/>',
             f'<path d="{outer}" fill="#7A4B2E"/>',
             f'<path transform="translate({pad} {pad})" d="{ARCH}" fill="#DCE6EE"/>',
             f'<path d="M{pad - frame * 0.55} {pad + AH} A{AW / 2 + frame * 0.55} {AH + frame * 0.55} 0 0 1 {pad + AW + frame * 0.55} {pad + AH}" fill="none" stroke="#B98A63" stroke-width="4"/>',
             f'<g transform="translate({pad} {pad})">' + "\n".join(arch_art(ink)) + "</g>",
             f'<rect y="{pad + AH}" width="{W}" height="40" fill="#5E3A24"/>']
    return svg(W, H, "\n".join(parts), "NARIN: arch mock-up")


# ---------- door windows (280 x 1000 each) ----------
WW, WH = 280, 1000


def window_art(side, ink):
    items, blocked = [], []
    eye = 330   # ~1.55 m above the floor: window bottom is ~0.9 m
    if side == "right":
        lg, lh = logo(WW / 2, eye - 40, 236, ink)
        items.append(lg)
        y = eye - 40 + lh + 70
        for w in ["Květiny", "Dárky", "Pokojovky"]:
            p, _ = text_path(w, 40, WW / 2, y, ink, tracking=0.06)
            items.append(p)
            y += 58
        blocked.append((0, eye - 80, WW, y - 10))
    else:
        y = eye + 30
        for w in ["květinový", "ateliér"]:
            p, _ = text_path(w, 46, WW / 2, y, ink, tracking=0.06)
            items.append(p)
            y += 64
        blocked.append((0, eye - 40, WW, y - 10))
    box = {"x0": 0, "x1": WW, "y0": 0, "y1": WH,
           "test": lambda x, y, r: 18 + r < x < WW - 18 - r and 18 + r < y < WH - 18 - r}
    flowers = scatter(box, blocked, 30000, 16, 30, 16, seed=5 if side == "left" else 9)
    return [layer("daisies", flowers), layer("logo-text", items)]


def window_decal(side, ink):
    guide = layer("cut-guide (do not print)", [f'<rect width="{WW}" height="{WH}" fill="none" stroke="#FF00FF" stroke-width="0.5"/>'])
    return svg(WW, WH, "\n".join([guide] + window_art(side, ink)),
               f"NARIN: door window decal 28 x 100 cm, {'left leaf 73' if side == 'left' else 'right leaf 75'}")


# ---------- whole entrance mock-up (from the street) ----------
def entrance_mock(ink):
    W, H = 2150, 3900
    x0, floor = (W - 1550) / 2, 3750
    door_top, band_top = floor - 2400, floor - 2400 - 500
    p = [f'<rect width="{W}" height="{H}" fill="#F4EFE6"/>',
         f'<rect x="{x0 - 140}" y="{band_top - 820}" width="{1550 + 280}" height="{floor - band_top + 820}" fill="#2F6FD8"/>',
         f'<rect y="{floor}" width="{W}" height="{H - floor}" fill="#CFC6B8"/>']
    # arch: frame + glass + decal
    ax = x0 + (1550 - AW) / 2
    p.append(f'<path d="M{ax - 55} {band_top} A{AW / 2 + 55} {AH + 55} 0 0 1 {ax + AW + 55} {band_top} Z" fill="#7A4B2E"/>')
    p.append(f'<g transform="translate({ax} {band_top - AH})"><path d="{ARCH}" fill="#DCE6EE"/>' + "\n".join(arch_art(ink)) + "</g>")
    # band over the door: carved strips + smooth middle
    p.append(f'<rect x="{x0}" y="{band_top}" width="1550" height="500" fill="#7A4B2E"/>')
    for yy in (band_top, band_top + 375):
        p.append(f'<rect x="{x0}" y="{yy}" width="1550" height="125" fill="#8C5A39"/>')
        for i in range(int(1550 / 70)):
            p.append(f'<rect x="{x0 + 18 + i * 70:.0f}" y="{yy + 35}" width="40" height="55" rx="6" fill="#5E3A24"/>')
    # leaves 730 + post 70 + 750
    for lx, lw, side in ((x0, 730, "left"), (x0 + 800, 750, "right")):
        p.append(f'<rect x="{lx}" y="{door_top}" width="{lw}" height="2400" fill="#2A63C4" stroke="#1D4FA3" stroke-width="10"/>')
        wx, wy = lx + (lw - WW) / 2, floor - 900 - WH
        p.append(f'<rect x="{wx}" y="{wy}" width="{WW}" height="{WH}" fill="#DCE6EE"/>')
        p.append(f'<g transform="translate({wx} {wy})">' + "\n".join(window_art(side, ink)) + "</g>")
    p.append(f'<rect x="{x0 + 730}" y="{door_top}" width="70" height="2400" fill="#1D4FA3"/>')
    p.append(f'<rect x="{x0 + 760}" y="{floor - 1150}" width="14" height="180" rx="7" fill="#C9CED6"/>')
    return svg(W, H, "\n".join(p), "NARIN: entrance mock-up from the street")


# ---------- logos ----------
def logo_files():
    files = {}
    for name, col in (("white", WHITE), ("blue", COBALT)):
        lg, lh = logo(LOGO_VB[2] / 2, 0, LOGO_VB[2], col)
        sub, _ = text_path("květinový ateliér", 104, LOGO_VB[2] / 2, lh + 128, col, width=LOGO_VB[2])
        files[f"narin-logo-{name}.svg"] = svg(LOGO_VB[2], round(lh), lg, f"NARIN logo ({name})")
        files[f"narin-lockup-{name}.svg"] = svg(LOGO_VB[2], round(lh + 160), lg + "\n" + sub, f"NARIN lockup ({name})")
    return files


files = {
    "arch-decal-white.svg": arch_decal(WHITE, "white text"),
    "arch-decal-blue.svg": arch_decal(COBALT, "blue text"),
    "arch-mockup.svg": arch_mock(WHITE),
    "door-window-left.svg": window_decal("left", WHITE),
    "door-window-right.svg": window_decal("right", WHITE),
    "entrance-mockup.svg": entrance_mock(WHITE),
    **logo_files(),
}
for name, content in files.items():
    (OUT / name).write_text(content, encoding="utf-8")
    print(f"{name:28s} {len(content) // 1024:5d} KB")
