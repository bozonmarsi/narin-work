"""Garden flowers drawn in the style of the label daisy: flat colour, chunky rounded petals, a hole or a dot in the middle.

Every function returns SVG elements (strings) in mm, placed by the foot of the stem on the ground.
"""
import math

STEM = "#2A9A4B"
LEAF_A, LEAF_B = "#2A9A4B", "#19C98A"


def _poly(points):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in points) + "Z"


def _smooth(points):
    """Closed Catmull-Rom curve through the points."""
    n, p = len(points), points
    d = f"M{p[0][0]:.1f} {p[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % n], p[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d + "Z"


def leaf(x, y, length, angle, color):
    w = length * 0.32
    return (f'<path transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" fill="{color}" '
            f'd="M0 0 Q{length * 0.45:.1f} {-w:.1f} {length:.1f} 0 Q{length * 0.45:.1f} {w:.1f} 0 0Z"/>')


def stem(x0, y0, x1, y1, width=7, bend=0.0):
    return (f'<path d="M{x0:.1f} {y0:.1f} Q{x0 + bend:.1f} {(y0 + y1) / 2:.1f} {x1:.1f} {y1:.1f}" fill="none" '
            f'stroke="{STEM}" stroke-width="{width}" stroke-linecap="round"/>')


def hole(x, y, r):
    """A see-through middle, like the label daisy (cut out of the glass sticker)."""
    return f'M{x + r:.1f} {y:.1f}A{r:.1f} {r:.1f} 0 1 0 {x - r:.1f} {y:.1f}A{r:.1f} {r:.1f} 0 1 0 {x + r:.1f} {y:.1f}Z'


def _petals(x, y, R, n, width, rot, notch=True):
    """n separate petals like the label daisy: narrow at the middle, wide rounded tip with a small notch."""
    shape = [(0.16, -0.06), (0.45, -width * 0.8), (0.8, -width), (0.98, -width * 0.55)]
    shape += [(0.92, 0.0)] if notch else [(1.02, 0.0)]
    shape += [(0.98, width * 0.55), (0.8, width), (0.45, width * 0.8), (0.16, 0.06)]
    d = ""
    for i in range(n):
        t = math.radians(rot) + 2 * math.pi * i / n
        c, s_ = math.cos(t), math.sin(t)
        d += _smooth([(x + R * (px * c - py * s_), y + R * (px * s_ + py * c)) for px, py in shape])
    return d


def five_petal(x, y, d, color, rot=0.0):
    """Five broad petals (primrose / forget-me-not), hole in the middle."""
    R = d / 2
    core = _smooth([(x + R * 0.26 * math.cos(2 * math.pi * i / 20), y + R * 0.26 * math.sin(2 * math.pi * i / 20)) for i in range(20)])
    # nonzero: petals and core (clockwise) merge, the hole (counter-clockwise) is cut out
    return f'<path fill="{color}" fill-rule="nonzero" d="{_petals(x, y, R, 5, 0.36, rot - 90)}{core}{hole(x, y, R * 0.15)}"/>'


def pompom(x, y, d, color, rot=0.0):
    """A round head with many short petals (zinnia / aster), hole in the middle."""
    R = d / 2
    core = _smooth([(x + R * 0.4 * math.cos(2 * math.pi * i / 24), y + R * 0.4 * math.sin(2 * math.pi * i / 24)) for i in range(24)])
    return f'<path fill="{color}" fill-rule="nonzero" d="{_petals(x, y, R, 12, 0.2, rot, notch=False)}{core}{hole(x, y, R * 0.15)}"/>'


def bell(x, y, d, color, angle=0.0):
    """One hanging bell (campanula) with a five-pointed rim; (x, y) is where it hangs."""
    w, h = d, d * 1.05
    pts = [(0, 0), (w * 0.24, h * 0.06), (w * 0.33, h * 0.4), (w * 0.42, h * 0.72), (w * 0.56, h * 0.95),
           (w * 0.32, h * 0.86), (w * 0.2, h * 1.02), (w * 0.06, h * 0.86), (0, h * 1.0), (-w * 0.06, h * 0.86),
           (-w * 0.2, h * 1.02), (-w * 0.32, h * 0.86), (-w * 0.56, h * 0.95), (-w * 0.42, h * 0.72),
           (-w * 0.33, h * 0.4), (-w * 0.24, h * 0.06)]
    return f'<path transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" fill="{color}" d="{_smooth(pts)}"/>'


def bellflower(x, ground, h, color, side=1):
    """An arching stem with three bells hanging from it."""
    tx, ty = x + side * 34, ground - h
    out = [f'<path d="M{x:.1f} {ground:.1f} Q{x - side * 6:.1f} {ground - h * 0.9:.1f} {tx:.1f} {ty:.1f}" fill="none" '
           f'stroke="{STEM}" stroke-width="6" stroke-linecap="round"/>',
           leaf(x, ground - h * 0.3, 44, -90 - side * 50, LEAF_B)]
    for i, f in enumerate((0.45, 0.72, 1.0)):
        # point on the quadratic stem
        bx = (1 - f) ** 2 * x + 2 * (1 - f) * f * (x - side * 6) + f * f * tx
        by = (1 - f) ** 2 * ground + 2 * (1 - f) * f * (ground - h * 0.9) + f * f * ty
        out.append(f'<path d="M{bx:.1f} {by:.1f} q{side * 10:.1f} -4 {side * 14:.1f} 10" fill="none" stroke="{STEM}" stroke-width="4" stroke-linecap="round"/>')
        out.append(bell(bx + side * 14, by + 8, 46 - i * 4, color, -side * 8))
    return out


def lupine(x, ground, h, color, light):
    """A tall spike of small rounded florets, getting smaller to the top."""
    out = [stem(x, ground, x, ground - h * 0.95, 7)]
    out.append(leaf(x, ground - h * 0.22, 50, -90 - 55, LEAF_A))
    out.append(leaf(x, ground - h * 0.22, 50, -90 + 55, LEAF_B))
    n = 7
    for i in range(n):
        f = i / (n - 1)
        yy = ground - h * (0.45 + 0.55 * f)
        r = 15 * (1 - 0.45 * f)
        for sgn in (-1, 1):
            out.append(f'<ellipse cx="{x + sgn * r * 0.8:.1f}" cy="{yy:.1f}" rx="{r:.1f}" ry="{r * 0.8:.1f}" '
                       f'fill="{color if i < n - 2 else light}"/>')
    out.append(f'<ellipse cx="{x:.1f}" cy="{ground - h - 6:.1f}" rx="7" ry="9" fill="{light}"/>')
    return out


def on_stem(head, x, ground, h, side=1, leaf_side=None):
    """Stem + one leaf + any round head function."""
    hx, hy = x + side * 5, ground - h
    ls = side if leaf_side is None else leaf_side
    # the stem stops under the head, so the hole in the middle stays see-through
    return [stem(x, ground, hx, hy + 20, 7), leaf(x, ground - h * 0.4, 48, -90 + ls * 55, LEAF_B)], (hx, hy)


# ---------- more kinds, two-tone (a coloured middle instead of the hole) ----------
def _disc(x, y, r, color):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{color}"/>'


def cosmos(x, y, d, color, center, rot=0.0):
    """Eight broad notched petals and a round middle."""
    R = d / 2
    return f'<path fill="{color}" d="{_petals(x, y, R, 8, 0.3, rot)}"/>' + _disc(x, y, R * 0.24, center)


def gerbera(x, y, d, color, center, rot=0.0):
    """Many thin petals around a big middle with a ring."""
    R = d / 2
    return (f'<path fill="{color}" d="{_petals(x, y, R, 18, 0.12, rot, notch=False)}"/>'
            + _disc(x, y, R * 0.4, center) + _disc(x, y, R * 0.22, color))


def anemone(x, y, d, color, center, rot=0.0):
    """Six round, overlapping petals and a dark middle."""
    R, out = d / 2, []
    for i in range(6):
        t = math.radians(rot) + 2 * math.pi * i / 6
        out.append(_disc(x + R * 0.5 * math.cos(t), y + R * 0.5 * math.sin(t), R * 0.48, color))
    return "".join(out) + _disc(x, y, R * 0.28, center)


def tiny_cluster(x, ground, h, color, center, side=1):
    """A branched stem with small five-petal flowers (forget-me-not)."""
    tx, ty = x + side * 8, ground - h
    out = [stem(x, ground, tx, ty + 10, 6), leaf(x, ground - h * 0.35, 40, -90 + side * 55, LEAF_A)]
    spots = [(0, 0), (-24, 14), (22, 10), (-10, 34), (16, 36), (-30, 40), (30, 34)]
    for i, (dx, dy) in enumerate(spots):
        fx, fy = tx + dx, ty + dy
        if i:
            out.append(f'<path d="M{tx:.1f} {ty + 30:.1f} L{fx:.1f} {fy:.1f}" stroke="{STEM}" stroke-width="3" stroke-linecap="round"/>')
    for dx, dy in spots:
        out.append(f'<path fill="{color}" d="{_petals(tx + dx, ty + dy, 14, 5, 0.42, -90)}"/>' + _disc(tx + dx, ty + dy, 3.5, center))
    return out


def buds(x, ground, h, color, side=1):
    """A curving stem with three round buds."""
    tx, ty = x + side * 26, ground - h
    out = [f'<path d="M{x:.1f} {ground:.1f} Q{x:.1f} {ground - h * 0.8:.1f} {tx:.1f} {ty:.1f}" fill="none" '
           f'stroke="{STEM}" stroke-width="6" stroke-linecap="round"/>', leaf(x, ground - h * 0.3, 42, -90 - side * 55, LEAF_B)]
    for f, r in ((1.0, 15), (0.7, 12), (0.45, 10)):
        bx = (1 - f) ** 2 * x + 2 * (1 - f) * f * x + f * f * tx
        by = (1 - f) ** 2 * ground + 2 * (1 - f) * f * (ground - h * 0.8) + f * f * ty
        ox = side * (16 if f < 1 else 0)
        out.append(f'<path d="M{bx:.1f} {by:.1f} L{bx + ox:.1f} {by - 8:.1f}" stroke="{STEM}" stroke-width="4" stroke-linecap="round"/>')
        out.append(f'<ellipse cx="{bx + ox:.1f}" cy="{by - 8 - r * 0.6:.1f}" rx="{r * 0.85:.1f}" ry="{r:.1f}" fill="{color}"/>')
        out.append(f'<path d="M{bx + ox - r * 0.6:.1f} {by - 8:.1f} Q{bx + ox:.1f} {by - 8 - r * 0.9:.1f} {bx + ox + r * 0.6:.1f} {by - 8:.1f}Z" fill="{LEAF_A}"/>')
    return out


def leafy(x, ground, h):
    """A clump of big round-tipped leaves, like a house plant."""
    out = []
    for ang, L, col in ((-150, h * 0.8, LEAF_A), (-120, h, LEAF_B), (-90, h * 1.1, LEAF_A), (-60, h, LEAF_B), (-30, h * 0.8, LEAF_A)):
        w = L * 0.42
        out.append(f'<path transform="translate({x:.1f} {ground:.1f}) rotate({ang})" fill="{col}" '
                   f'd="M0 0 C{L * 0.25:.1f} {-w:.1f} {L * 0.9:.1f} {-w:.1f} {L:.1f} 0 C{L * 0.9:.1f} {w:.1f} {L * 0.25:.1f} {w:.1f} 0 0Z"/>')
        out.append(f'<path transform="translate({x:.1f} {ground:.1f}) rotate({ang})" d="M{L * 0.15:.1f} 0 L{L * 0.8:.1f} 0" '
                   f'stroke="#E6F4EA" stroke-width="3" stroke-linecap="round" opacity="0.7"/>')
    return out
