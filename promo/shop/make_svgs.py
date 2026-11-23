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

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import flowers as FL  # noqa: E402

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
    "E-scatter": "equal daisies scattered evenly over the glass, like on the label",
    "F-pattern": "equal daisies on a staggered grid over the glass",
    "G-scatter-small": "smaller equal daisies, scattered more densely, daisies as separators",
    "H-big": "bigger equal daisies, fewer, over the whole glass around the text",
    "I-bigger": "even bigger equal daisies, fewest, over the whole glass around the text",
    "J-big-nosub": "as H, without \"květinový ateliér\", with a bigger logo and bottom line",
    "K-bigger-nosub": "as I, without \"květinový ateliér\", with a bigger logo and bottom line",
    "L-sign-flowerbox": "lettering along the arch, NARIN in the middle, a window box of daisies on stems at the bottom",
    "M-wreath": "NARIN crowned by a half wreath of daisies and leaves, the line below",
    "N-sign-border": "lettering along the arch, NARIN in the middle, a neat border of daisies along the bottom",
    "O-garden-arc": "a garden along the bottom (two rows of many flowers, leaves and grass), bigger lettering along the arch",
    "P-garden-line": "the same garden, the line of words set big and straight under NARIN",
}


def bottom_line(ink, y, max_w, size, sep):
    """"Květiny · Dárky · Rostliny" with dots or daisies between the words, centred, fitted to max_w."""
    words = ["Květiny", "Dárky", "Rostliny"]
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


# ---------- composed layouts ----------
LEAF_GREEN, LEAF_LIGHT = "#2A9A4B", "#19C98A"


def text_on_arch(text, size, inset, ink, tracking=0.16, center_deg=90):
    """Outline `text` along the arch, baseline on an ellipse `inset` mm inside the glass edge, centred at the top."""
    rx, ry = AW / 2 - inset, AH - inset
    ts = [math.radians(i / 20) for i in range(0, 3601)]          # 0..180 deg, left to right
    pts = [(AW / 2 - rx * math.cos(t), AH - ry * math.sin(t)) for t in ts]
    acc = [0.0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        acc.append(acc[-1] + math.hypot(x1 - x0, y1 - y0))
    mid = acc[int(center_deg * 20)]
    gs, cmap, hmtx = FONT.getGlyphSet(), FONT.getBestCmap(), FONT["hmtx"]
    k = size / FONT["head"].unitsPerEm
    adv = [hmtx[cmap[ord(ch)]][0] * k for ch in text]
    total = sum(adv) + tracking * size * (len(text) - 1)
    pos, out, j = mid - total / 2, [], 0
    for ch, a in zip(text, adv):
        c = pos + a / 2
        while acc[j] < c and j < len(acc) - 1:
            j += 1
        (x0, y0), (x1, y1) = pts[max(j - 1, 0)], pts[min(j + 1, len(pts) - 1)]
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
        if ch != " ":
            g, _ = text_path(ch, size, 0, 0, ink, "middle")
            out.append(f'<g transform="translate({pts[j][0]:.1f} {pts[j][1]:.1f}) rotate({ang:.2f})">{g}</g>')
        pos += a + tracking * size
    return out


def leaf(x, y, length, angle, color):
    w = length * 0.32
    return (f'<path transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" fill="{color}" '
            f'd="M0 0 Q{length * 0.45:.1f} {-w:.1f} {length:.1f} 0 Q{length * 0.45:.1f} {w:.1f} 0 0Z"/>')


def flowerbox(stems=True):
    """Daisies on stems growing from the bottom edge, symmetric, two heights, like a window box."""
    items, heads = [], []
    order = [BLUE, RED, YELLOW, PURPLE, GREEN, LILAC, RED, YELLOW]
    step, d = 92, 64
    for k in range(0, 8):
        for side in ((1,) if k == 0 else (-1, 1)):
            x = AW / 2 + side * k * step
            h = (112 if k % 2 == 0 else 84) if stems else 60   # alternate tall / short
            if not arch_inner(x, AH - h, d / 2, 18):
                continue
            hx, hy = x + (side * 4 if stems else 0), AH - h
            if not stems:
                heads.append(daisy(hx, hy, d, order[k % len(order)], 0))
                continue
            items.append(f'<path d="M{x:.1f} {AH + 2} Q{x:.1f} {AH - h * 0.5:.1f} {hx:.1f} {hy:.1f}" fill="none" '
                         f'stroke="{LEAF_GREEN}" stroke-width="7" stroke-linecap="round"/>')
            items.append(leaf(x, AH - h * 0.38, 46, -90 + side * (55 if k % 2 else -55), LEAF_LIGHT))
            heads.append(daisy(hx, hy, d, order[k % len(order)], 0))
    return items + heads


def wreath(cx, cy, rx, ry, n, d):
    """A half wreath above (cx, cy): leaves along the curve, daisies at even steps, symmetric colours."""
    items, heads = [], []
    order = [BLUE, RED, YELLOW, PURPLE, LILAC, GREEN]
    for i in range(n):
        t = math.radians(8 + (180 - 16) * i / (n - 1))
        x, y = cx - rx * math.cos(t), cy - ry * math.sin(t)
        tang = math.degrees(math.atan2(-ry * math.cos(t), rx * math.sin(t)))
        m = min(i, n - 1 - i)
        heads.append(daisy(x, y, d, order[m % len(order)], 0))
        if i < n - 1:   # a pair of leaves between this daisy and the next
            t2 = math.radians(8 + (180 - 16) * (i + 0.5) / (n - 1))
            lx, ly = cx - rx * math.cos(t2), cy - ry * math.sin(t2)
            ang = math.degrees(math.atan2(-ry * math.cos(t2), rx * math.sin(t2)))
            items.append(leaf(lx, ly, 46, ang + 180 + 35, LEAF_GREEN))
            items.append(leaf(lx, ly, 46, ang - 35, LEAF_LIGHT))
    return items + heads


def sign_art(ink, flowers):
    """Sign-painter layout: a keyline and the line of words following the arch, the wordmark below."""
    arc = text_on_arch("KVĚTINY · DÁRKY · ROSTLINY", 60, 122, ink, tracking=0.2)
    rx, ry = AW / 2 - 36, AH - 36
    t0, t1 = math.radians(24), math.radians(156)
    xa, ya = AW / 2 - rx * math.cos(t0), AH - ry * math.sin(t0)
    xb, yb = AW / 2 - rx * math.cos(t1), AH - ry * math.sin(t1)
    key = f'<path d="M{xa:.1f} {ya:.1f} A{rx} {ry} 0 0 1 {xb:.1f} {yb:.1f}" fill="none" stroke="{ink}" stroke-width="4" stroke-linecap="round"/>'
    lg, _ = logo(AW / 2, 315, 760, ink)
    return [layer("keyline", [key]), layer("daisies", flowers), layer("logo", [lg]), layer("text", arc)]


def sprig(x, ground, h, side):
    out = [f'<path d="M{x:.1f} {ground} Q{x + side * 6:.1f} {ground - h * 0.5:.1f} {x + side * 10:.1f} {ground - h:.1f}" '
           f'fill="none" stroke="{LEAF_GREEN}" stroke-width="6" stroke-linecap="round"/>']
    for i, f in enumerate((0.35, 0.6, 0.85)):
        yy, xx = ground - h * f, x + side * 10 * f
        out.append(leaf(xx, yy, 40 - i * 6, -90 - 50, LEAF_GREEN if i % 2 else LEAF_LIGHT))
        out.append(leaf(xx, yy, 40 - i * 6, -90 + 50, LEAF_LIGHT if i % 2 else LEAF_GREEN))
    out.append(leaf(x + side * 10, ground - h, 34, -90, LEAF_LIGHT))
    return out


def garden(max_h, inset=34):
    """A mixed garden along the bottom edge on a continuous lawn: a back and a front row of many kinds of flowers."""
    grass = []
    rnd = random.Random(8)
    for x in range(40, AW - 40, 13):
        h = rnd.uniform(16, 34)
        if not arch_inner(x, AH - h, 4, inset - 10):
            continue
        lean = rnd.uniform(-7, 7)
        grass.append(f'<path d="M{x - 4} {AH + 1} Q{x + lean * 0.3:.1f} {AH - h * 0.6:.1f} {x + lean:.1f} {AH - h:.1f} '
                     f'Q{x + 1 + lean * 0.3:.1f} {AH - h * 0.5:.1f} {x + 4} {AH + 1}Z" fill="{rnd.choice([LEAF_GREEN, LEAF_LIGHT, "#3DAF5C"])}"/>')
    # two rows of mixed flowers, not mirrored: each spot takes the next kind/colour pair from a shuffled deck,
    # never the same kind or the same main colour as its left neighbour. Kinds are drawn in flowers.py.
    CORAL, WHITE_ = "#FF7C77", "#FFFFFF"
    combos = [("gerbera", YELLOW, CORAL), ("gerbera", CORAL, YELLOW), ("gerbera", PURPLE, YELLOW), ("gerbera", WHITE_, CORAL),
              ("cosmos", LILAC, PURPLE), ("cosmos", WHITE_, YELLOW), ("cosmos", CORAL, YELLOW), ("cosmos", YELLOW, RED),
              ("anemone", RED, BLUE), ("anemone", WHITE_, PURPLE), ("anemone", PURPLE, YELLOW), ("anemone", COBALT, WHITE_),
              ("daisy", BLUE, None), ("daisy", YELLOW, None), ("daisy", RED, None), ("daisy", PURPLE, None), ("daisy", LILAC, None),
              ("five", YELLOW, None), ("five", RED, None), ("five", WHITE_, None), ("five", LILAC, None),
              ("pompom", LILAC, None), ("pompom", YELLOW, None), ("pompom", CORAL, None), ("pompom", PURPLE, None),
              ("cluster", COBALT, YELLOW), ("cluster", LILAC, YELLOW), ("cluster", WHITE_, YELLOW),
              ("buds", CORAL, None), ("buds", PURPLE, None), ("buds", YELLOW, None),
              ("bells", PURPLE, None), ("bells", COBALT, None)]
    deck = []

    def draw_next(prev):
        nonlocal deck
        for _ in range(200):
            if not deck:
                deck = combos[:]
                rnd.shuffle(deck)
            c = deck.pop()
            if prev is None or (c[0] != prev[0] and c[1] != prev[1]):
                return c
            deck.insert(0, c)
        return deck.pop()

    step, d = 76, 64
    layers = {"back": ([], []), "front": ([], [])}
    for row, x0, hmin, hmax in (("back", 60, 0.78, 1.0), ("front", 60 + step / 2, 0.42, 0.6)):
        st, hd = layers[row]
        prev, x, n = None, x0, 0
        while x < AW - 40:
            xx = x + rnd.uniform(-12, 12)
            h = max_h * rnd.uniform(hmin, hmax)
            dd = d * (1 if row == "back" else 0.82)
            x += step
            n += 1
            if not arch_inner(xx, AH - h, dd / 2, inset):
                continue
            if row == "front" and n % 5 == 3:
                st += FL.leafy(xx, AH + 2, h * 0.75)
                continue
            kind, col, mid = c = draw_next(prev)
            prev = c
            side = rnd.choice((-1, 1))
            if kind == "bells":
                st += FL.bellflower(xx - side * 14, AH + 2, h, col, side)
            elif kind == "cluster":
                st += FL.tiny_cluster(xx, AH + 2, h, col, mid, side)
            elif kind == "buds":
                st += FL.buds(xx, AH + 2, h, col, side)
            else:
                els, (hx, hy) = FL.on_stem(None, xx, AH + 2, h, side)
                st += els
                rot = rnd.uniform(0, 40)
                if kind == "daisy":
                    hd.append(daisy(hx, hy, dd, col, rot))
                elif kind == "five":
                    hd.append(FL.five_petal(hx, hy, dd * 0.95, col, rot))
                elif kind == "pompom":
                    hd.append(FL.pompom(hx, hy, dd, col, rot))
                elif kind == "cosmos":
                    hd.append(FL.cosmos(hx, hy, dd, col, mid, rot))
                elif kind == "gerbera":
                    hd.append(FL.gerbera(hx, hy, dd * 1.05, col, mid, rot))
                else:
                    hd.append(FL.anemone(hx, hy, dd * 0.9, col, mid, rot))
    # a continuous lawn: one band behind everything, one between the rows, one in front, so every stem grows
    # out of the same grass. Its own random generator keeps the flower layout exactly as before.
    lawn_rnd = random.Random(31)

    def lawn(hmin, hmax, step, color):
        d, x = f"M-10 {AH + 4} L-10 {AH - hmin * 0.5:.1f}", -10.0
        while x < AW + 10:
            w = step * lawn_rnd.uniform(0.7, 1.3)
            h = lawn_rnd.uniform(hmin, hmax)
            lean = lawn_rnd.uniform(-0.35, 0.35) * w
            d += (f" Q{x + w * 0.35:.1f} {AH - h * 0.45:.1f} {x + w / 2 + lean:.1f} {AH - h:.1f}"
                  f" Q{x + w * 0.65:.1f} {AH - h * 0.45:.1f} {x + w:.1f} {AH - hmin * 0.5:.1f}")
            x += w
        return f'<path fill="{color}" d="{d} L{AW + 10} {AH + 4}Z"/>'

    return ([lawn(30, 58, 22, "#238544")] + layers["back"][0] + layers["back"][1]
            + [lawn(20, 38, 18, LEAF_GREEN)] + grass + layers["front"][0] + layers["front"][1]
            + [lawn(10, 22, 15, "#3DAF5C")])


def keyline(ink, inset=34, a0=24, a1=156):
    rx, ry = AW / 2 - inset, AH - inset
    t0, t1 = math.radians(a0), math.radians(a1)
    xa, ya = AW / 2 - rx * math.cos(t0), AH - ry * math.sin(t0)
    xb, yb = AW / 2 - rx * math.cos(t1), AH - ry * math.sin(t1)
    return f'<path d="M{xa:.1f} {ya:.1f} A{rx} {ry} 0 0 1 {xb:.1f} {yb:.1f}" fill="none" stroke="{ink}" stroke-width="4" stroke-linecap="round"/>'


def composed_art(ink, variant):
    if variant == "O-garden-arc":
        arc = text_on_arch("KVĚTINY · DÁRKY · ROSTLINY", 74, 112, ink, tracking=0.12)
        lg, _ = logo(AW / 2, 300, 700, ink)
        return [layer("keyline", [keyline(ink, 30, 26, 154)]), layer("garden", garden(170)), layer("logo", [lg]), layer("text", arc)]
    if variant == "P-garden-line":
        lg, lh = logo(AW / 2, 165, 740, ink)
        line = bottom_line(ink, 165 + lh + 125, 1160, 104, "dot")
        return [layer("keyline", [keyline(ink, 34, 20, 160)]), layer("garden", garden(140)), layer("logo", [lg]), layer("text", line)]
    if variant == "L-sign-flowerbox":
        return sign_art(ink, flowerbox(stems=True))
    if variant == "N-sign-border":
        return sign_art(ink, flowerbox(stems=False))
    # M-wreath
    logo_w, top = 680, 250
    lg, lh = logo(AW / 2, top, logo_w, ink)
    flowers = wreath(AW / 2, top + lh * 0.95, 500, 330, 13, 56)
    line = bottom_line(ink, 625, 1180, 92, "dot")
    return [layer("daisies", flowers), layer("logo", [lg]), layer("text", line)]


def arch_art(ink, variant="A-garland"):
    if variant in ("L-sign-flowerbox", "M-wreath", "N-sign-border", "O-garden-arc", "P-garden-line"):
        return composed_art(ink, variant)
    SCAT = ("E-scatter", "F-pattern", "G-scatter-small", "H-big", "I-bigger")
    if variant in ("J-big-nosub", "K-bigger-nosub"):
        # no subtitle: the wordmark and the bottom line get the room
        logo_w, top, line_y = 840, 140, 592
        lg, lh = logo(AW / 2, top, logo_w, ink)
        line = bottom_line(ink, line_y, 1240, 108, "dot")
        pad = 14
        blocked = [(AW / 2 - logo_w / 2 - pad, top - pad, AW / 2 + logo_w / 2 + pad, top + lh + pad),
                   (AW / 2 - 620 - pad, line_y - 78 - pad, AW / 2 + 620 + pad, line_y + 24 + pad)]
        box = {"x0": 0, "x1": AW, "y0": 0, "y1": AH, "test": lambda x, y, r: arch_inner(x, y, r, 30)}
        r, gap, seed = (40, 46, 7) if variant == "J-big-nosub" else (47, 40, 4)
        flowers = scatter(box, blocked, 80000, r, r, gap, seed=seed)
        return [layer("daisies", flowers), layer("logo", [lg]), layer("text", line)]
    logo_w, top = (700, 165) if variant == "A-garland" else (660, 150) if variant in SCAT else (760, 140)
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
    elif variant in ("E-scatter", "G-scatter-small"):
        pad = 16   # tight boxes around each line, so daisies can sit between the lines too
        blocked = [(AW / 2 - logo_w / 2 - pad, top - pad, AW / 2 + logo_w / 2 + pad, top + lh + pad),
                   (AW / 2 - logo_w / 2 - pad, sub_y - 52 - pad, AW / 2 + logo_w / 2 + pad, sub_y + 16 + pad),
                   (AW / 2 - 560 - pad, 612 - 66 - pad, AW / 2 + 560 + pad, 612 + 20 + pad)]
        box = {"x0": 0, "x1": AW, "y0": 0, "y1": AH, "test": lambda x, y, r: arch_inner(x, y, r, 36)}
        r, gap = (23, 46) if variant == "E-scatter" else (16, 30)
        flowers = scatter(box, blocked, 80000, r, r, gap, seed=3 if variant == "E-scatter" else 21)
        sep = "dot" if variant == "E-scatter" else "daisy"
    elif variant == "F-pattern":
        pad = 16   # tight boxes around each line, so daisies can sit between the lines too
        blocked = [(AW / 2 - logo_w / 2 - pad, top - pad, AW / 2 + logo_w / 2 + pad, top + lh + pad),
                   (AW / 2 - logo_w / 2 - pad, sub_y - 52 - pad, AW / 2 + logo_w / 2 + pad, sub_y + 16 + pad),
                   (AW / 2 - 560 - pad, 612 - 66 - pad, AW / 2 + 560 + pad, 612 + 20 + pad)]
        d, dx, dy = 36, 96, 84
        row = 0
        for y in [60 + row * dy for row in range(8)]:
            off = dx / 2 if round((y - 60) / dy) % 2 else 0
            for col in range(-3, 18):
                x = AW / 2 - 5 * dx + off + col * dx
                rr = d / 2
                if not arch_inner(x, y, rr, 34):
                    continue
                if any(bx0 - rr < x < bx1 + rr and by0 - rr < y < by1 + rr for bx0, by0, bx1, by1 in blocked):
                    continue
                k = round((y - 60) / dy) * 2 + col
                flowers.append(daisy(x, y, d, DAISY_COLS[k % 6], 0))
    elif variant in ("H-big", "I-bigger"):
        pad = 14
        blocked = [(AW / 2 - logo_w / 2 - pad, top - pad, AW / 2 + logo_w / 2 + pad, top + lh + pad),
                   (AW / 2 - logo_w / 2 - pad, sub_y - 52 - pad, AW / 2 + logo_w / 2 + pad, sub_y + 16 + pad),
                   (AW / 2 - 560 - pad, 612 - 66 - pad, AW / 2 + 560 + pad, 612 + 20 + pad)]
        box = {"x0": 0, "x1": AW, "y0": 0, "y1": AH, "test": lambda x, y, r: arch_inner(x, y, r, 30)}
        r, gap, seed = (40, 52, 7) if variant == "H-big" else (50, 64, 4)
        flowers = scatter(box, blocked, 80000, r, r, gap, seed=seed)
    else:
        sep = "daisy"
    line = bottom_line(ink, 612 if variant != "C-ribbon" else 628, 1040 if variant == "A-garland" else 1120 if variant in SCAT else 1180, 88, sep)
    return [layer("daisies", flowers), layer("logo", [lg]), layer("text", [sub] + line)]


def arch_decal(ink, variant):
    guide = layer("cut-guide (do not print)", [f'<path d="{ARCH}" fill="none" stroke="#FF00FF" stroke-width="0.5"/>'])
    return svg(AW, AH, "\n".join([guide] + arch_art(ink, variant)), f"NARIN: arch glass decal 144 x 70 cm, {variant}: {VARIANTS[variant]}")


def print_file(ink, variant, mirror=False):
    """Production file: artwork clipped exactly to the glass, cut contour on its own layer; optionally mirrored
    for mounting on the inside of the glass."""
    art = "\n".join(arch_art(ink, variant))
    cut = layer("CUT contour - do not print", [f'<path d="{ARCH}" fill="none" stroke="#FF00FF" stroke-width="0.5"/>'])
    body = (f'<defs><clipPath id="glass"><path d="{ARCH}"/></clipPath></defs>\n'
            f'<g id="artwork" clip-path="url(#glass)">\n{art}\n</g>\n{cut}')
    if mirror:
        body = f'<g transform="matrix(-1 0 0 1 {AW} 0)">\n{body}\n</g>'
    side = "MIRRORED for mounting inside the glass" if mirror else "for mounting on the outside of the glass"
    return svg(AW, AH, body, f"NARIN arch glass 1440 x 700 mm, print file, {side}")


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
PRINT = OUT.parent / "print"
PRINT.mkdir(exist_ok=True)
(PRINT / "NARIN-arch-1440x700mm.svg").write_text(print_file(WHITE, "P-garden-line"), encoding="utf-8")
(PRINT / "NARIN-arch-1440x700mm-MIRRORED.svg").write_text(print_file(WHITE, "P-garden-line", True), encoding="utf-8")
for name, content in files.items():
    (OUT / name).write_text(content, encoding="utf-8")
    print(f"{name:32s} {len(content) // 1024:5d} KB")
