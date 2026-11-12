"""Shop-front graphics for NARIN as print-ready SVG (1 user unit = 1 mm, text outlined).

    python3 make_svgs.py <Ubuntu-Medium.ttf> [out_dir]

The arch glass over the entrance is 144 x 70 cm (entrance plan, 12.11.2026). Four layouts of the daisies, see VARIANTS.
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


VARIANTS = {
    "A-garland": "a garland of equal daisies along the arch",
    "B-bouquets": "two small bouquets at the sides",
    "C-ribbon": "a row of small daisies between the lines",
    "D-minimal": "only two daisies, as separators in the bottom line",
}


def bottom_line(ink, y, max_w, size, sep):
    """"Květiny · Dárky · Pokojovky" with dots or daisies between the words, centred, fitted to max_w."""
    words = ["Květiny", "Dárky", "Pokojovky"]
    track = 0.04
    widths = [text_path(w, size, 0, 0, ink, "start", track)[1] for w in words]
    gap = size * (1.5 if sep == "daisy" else 0.8)
    total = sum(widths) + 2 * gap
    if total > max_w:
        size *= max_w / total
        widths = [w * max_w / total for w in widths]
        gap *= max_w / total
        total = max_w
    x, items = AW / 2 - total / 2, []
    for i, (w, wd) in enumerate(zip(words, widths)):
        items.append(text_path(w, size, x, y, ink, "start", track)[0])
        x += wd
        if i < 2:
            cx, cy = x + gap / 2, y - size * 0.34
            if sep == "daisy":
                items.append(daisy(cx, cy, size * 0.72, [RED, YELLOW][i], 0))
            else:
                items.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{size * 0.075:.1f}" fill="{ink}"/>')
            x += gap
    return items


def ellipse_points(n, inset, t0, t1):
    """n points evenly spaced by arc length on the arch, inset mm from the edge, angles t0..t1 (deg, 0 = left)."""
    rx, ry = AW / 2 - inset, AH - inset
    ts = [math.radians(t0 + (t1 - t0) * i / 2000) for i in range(2001)]
    pts = [(AW / 2 - rx * math.cos(t), AH - ry * math.sin(t)) for t in ts]
    acc = [0.0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        acc.append(acc[-1] + math.hypot(x1 - x0, y1 - y0))
    out, j = [], 0
    for i in range(n):
        target = acc[-1] * i / (n - 1)
        while acc[j] < target and j < len(acc) - 1:
            j += 1
        out.append(pts[j])
    return out


def arch_art(ink, variant="A-garland"):
    logo_w, top = (700, 165) if variant == "A-garland" else (760, 140)
    lg, lh = logo(AW / 2, top, logo_w, ink)
    sub_y = top + lh + 84
    sub, _ = text_path("květinový ateliér", 66, AW / 2, sub_y, ink, width=logo_w)
    flowers = []
    sep = "dot"
    if variant == "A-garland":
        for i, (x, y) in enumerate(ellipse_points(19, 50, 15, 165)):
            flowers.append(daisy(x, y, 58, DAISY_COLS[i % 6], 0))
    elif variant == "B-bouquets":
        for side in (-1, 1):
            cx = AW / 2 + side * 540
            for dx, dy, c in ((-34, -40, BLUE), (34, -22, RED), (-14, 34, YELLOW), (46, 44, LILAC)):
                flowers.append(daisy(cx + side * dx, 395 + dy, 66, c, 0))
    elif variant == "C-ribbon":
        n = 13
        for i in range(n):
            flowers.append(daisy(AW / 2 - logo_w / 2 + 20 + (logo_w - 40) * i / (n - 1), sub_y + 62, 38, DAISY_COLS[i % 6], 0))
    else:
        sep = "daisy"
    line = bottom_line(ink, 612 if variant != "C-ribbon" else 628, 1040 if variant == "A-garland" else 1180, 88, sep)
    return [layer("daisies", flowers), layer("logo", [lg]), layer("text", [sub] + line)]


def arch_decal(ink, variant):
    guide = layer("cut-guide (do not print)", [f'<path d="{ARCH}" fill="none" stroke="#FF00FF" stroke-width="0.5"/>'])
    return svg(AW, AH, "\n".join([guide] + arch_art(ink, variant)), f"NARIN: arch glass decal 144 x 70 cm, {variant}: {VARIANTS[variant]}")


def arch_mock(ink, variant):
    pad, frame = 120, 55
    W, H = AW + 2 * pad, AH + pad + 40
    outer = f"M{pad - frame} {pad + AH} A{AW / 2 + frame} {AH + frame} 0 0 1 {pad + AW + frame} {pad + AH} Z"
    parts = [f'<rect width="{W}" height="{H}" fill="#2F6FD8"/>',
             f'<path d="{outer}" fill="#7A4B2E"/>',
             f'<path transform="translate({pad} {pad})" d="{ARCH}" fill="#DCE6EE"/>',
             f'<path d="M{pad - frame * 0.55} {pad + AH} A{AW / 2 + frame * 0.55} {AH + frame * 0.55} 0 0 1 {pad + AW + frame * 0.55} {pad + AH}" fill="none" stroke="#B98A63" stroke-width="4"/>',
             f'<g transform="translate({pad} {pad})">' + "\n".join(arch_art(ink, variant)) + "</g>",
             f'<rect y="{pad + AH}" width="{W}" height="40" fill="#5E3A24"/>']
    return svg(W, H, "\n".join(parts), "NARIN: arch mock-up")


# ---------- logos ----------
def logo_files():
    files = {}
    for name, col in (("white", WHITE), ("blue", COBALT)):
        lg, lh = logo(LOGO_VB[2] / 2, 0, LOGO_VB[2], col)
        sub, _ = text_path("květinový ateliér", 104, LOGO_VB[2] / 2, lh + 128, col, width=LOGO_VB[2])
        files[f"narin-logo-{name}.svg"] = svg(LOGO_VB[2], round(lh), lg, f"NARIN logo ({name})")
        files[f"narin-lockup-{name}.svg"] = svg(LOGO_VB[2], round(lh + 160), lg + "\n" + sub, f"NARIN lockup ({name})")
    return files


files = logo_files()
for v in VARIANTS:
    files[f"arch-decal-{v}.svg"] = arch_decal(WHITE, v)
    files[f"arch-mockup-{v}.svg"] = arch_mock(WHITE, v)
for name, content in files.items():
    (OUT / name).write_text(content, encoding="utf-8")
    print(f"{name:32s} {len(content) // 1024:5d} KB")
