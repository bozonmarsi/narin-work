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


def shade(color, k):
    """k < 0 darkens towards ink, k > 0 lightens towards white."""
    c = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    t = (20, 32, 74) if k < 0 else (255, 255, 255)
    k = abs(k)
    return "#" + "".join(f"{round(a + (b - a) * k):02X}" for a, b in zip(c, t))


DEEP = {"#FFD84A": "#F5A623", "#FF7C77": "#F0544A", "#8B55F6": "#6A35D6", "#FFFFFF": "#F2E6D4",
        "#F3CDF6": "#DFA2EC", "#FF3B2F": "#D8261C", "#1C70E3": "#1452B8", "#0B4DB5": "#08378A"}


def deep(color, k=0.2):
    return DEEP.get(color.upper(), shade(color, -k))


def leaf(x, y, length, angle, color, vein=True):
    w = length * 0.32
    out = (f'<path transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" fill="{color}" '
           f'd="M0 0 C{length * 0.25:.1f} {-w:.1f} {length * 0.7:.1f} {-w:.1f} {length:.1f} 0 '
           f'C{length * 0.7:.1f} {w:.1f} {length * 0.25:.1f} {w:.1f} 0 0Z"/>')
    if vein and length > 30:
        out += (f'<path transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" d="M{length * 0.12:.1f} 0 '
                f'Q{length * 0.5:.1f} {-w * 0.12:.1f} {length * 0.86:.1f} 0" fill="none" stroke="{shade(color, 0.45)}" '
                f'stroke-width="2.2" stroke-linecap="round"/>')
    return out


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
    """Eight broad notched petals with a darker blush at the base, and a round middle."""
    R = d / 2
    return (f'<path fill="{color}" d="{_petals(x, y, R, 8, 0.3, rot)}"/>'
            f'<path fill="{deep(color)}" d="{_petals(x, y, R * 0.48, 8, 0.36, rot, notch=False)}"/>'
            + _disc(x, y, R * 0.24, center) + _disc(x, y, R * 0.1, shade(center, -0.25)))


def gerbera(x, y, d, color, center, rot=0.0):
    """Two rings of thin petals (the inner one darker) around a big middle with a ring."""
    R = d / 2
    return (f'<path fill="{color}" d="{_petals(x, y, R, 20, 0.12, rot, notch=False)}"/>'
            f'<path fill="{deep(color)}" d="{_petals(x, y, R * 0.7, 20, 0.16, rot + 9, notch=False)}"/>'
            + _disc(x, y, R * 0.4, center) + _disc(x, y, R * 0.26, shade(center, -0.3)) + _disc(x, y, R * 0.12, center))


def anemone(x, y, d, color, center, rot=0.0):
    """Six round, overlapping petals and a dark middle."""
    R, out = d / 2, []
    for i in range(6):
        t = math.radians(rot) + 2 * math.pi * i / 6
        out.append(_disc(x + R * 0.5 * math.cos(t), y + R * 0.5 * math.sin(t), R * 0.48, color))
    out.append(_disc(x, y, R * 0.42, deep(color)))
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
                   f'stroke="#A8DDB8" stroke-width="3" stroke-linecap="round"/>')
    return out


# ---------- orchid, iris, calla ----------
def _blade(L, W, tip=1.0):
    """A petal along +x from the origin: length L, width W; tip > 1 makes the end rounder."""
    return (f"M0 0 C{L * 0.15:.1f} {-W * 0.55:.1f} {L * 0.62:.1f} {-W * 0.62 * tip:.1f} {L:.1f} {-W * 0.08:.1f} "
            f"C{L * 1.02:.1f} {W * 0.05:.1f} {L * 0.98:.1f} {W * 0.12:.1f} {L * 0.93:.1f} {W * 0.18:.1f} "
            f"C{L * 0.6:.1f} {W * 0.62 * tip:.1f} {L * 0.15:.1f} {W * 0.55:.1f} 0 0Z")


def _rot(x, y, angle, d, fill, line=None, lw=0):
    stroke = f' stroke="{line}" stroke-width="{lw:.1f}" stroke-linejoin="round"' if line else ""
    return f'<path transform="translate({x:.1f} {y:.1f}) rotate({angle:.1f})" fill="{fill}"{stroke} d="{d}"/>'


def orchid_flower(x, y, S, color, lip, rot=0.0):
    """Phalaenopsis seen from the front: three narrow sepals, two big round petals with fanned veins,
    a small three-lobed lip with a yellow callus, and a pale column."""
    sep, line = shade(color, -0.06), deep(color)
    lw = S * 0.012
    out = [_rot(x, y, rot - 90, _blade(S * 0.5, S * 0.24), sep, line, lw),
           _rot(x, y, rot + 52, _blade(S * 0.46, S * 0.22), sep, line, lw),
           _rot(x, y, rot + 128, _blade(S * 0.46, S * 0.22), sep, line, lw),
           _rot(x, y, rot - 6, _blade(S * 0.5, S * 0.52, 1.3), color, line, lw),
           _rot(x, y, rot + 186, _blade(S * 0.5, S * 0.52, 1.3), color, line, lw)]
    for a in (-6, 186):                                    # three veins fanning out on each big petal
        for v in (-0.12, 0.0, 0.12):
            out.append(f'<path transform="translate({x:.1f} {y:.1f}) rotate({rot + a:.1f})" '
                       f'd="M{S * 0.08:.1f} 0 Q{S * 0.25:.1f} {S * v * 0.5:.1f} {S * 0.4:.1f} {S * v:.1f}" fill="none" '
                       f'stroke="{line}" stroke-width="{S * 0.012:.1f}" stroke-linecap="round" opacity="1"/>')
    ly = y + S * 0.08
    wing = shade(lip, 0.35)
    out.append(_rot(x - S * 0.02, ly, -150, _blade(S * 0.16, S * 0.12, 1.3), wing))     # side lobes
    out.append(_rot(x + S * 0.02, ly, -30, _blade(S * 0.16, S * 0.12, 1.3), wing))
    out.append(f'<path fill="{lip}" d="M{x - S * 0.08:.1f} {ly:.1f} C{x - S * 0.12:.1f} {ly + S * 0.08:.1f} {x - S * 0.08:.1f} {ly + S * 0.18:.1f} {x:.1f} {ly + S * 0.2:.1f} '
               f'C{x + S * 0.08:.1f} {ly + S * 0.18:.1f} {x + S * 0.12:.1f} {ly + S * 0.08:.1f} {x + S * 0.08:.1f} {ly:.1f} '
               f'C{x + S * 0.03:.1f} {ly + S * 0.03:.1f} {x - S * 0.03:.1f} {ly + S * 0.03:.1f} {x - S * 0.08:.1f} {ly:.1f}Z"/>')
    for sgn in (-1, 1):                                    # the two little tendrils at the tip of the lip
        out.append(f'<path d="M{x + sgn * S * 0.02:.1f} {ly + S * 0.19:.1f} q{sgn * S * 0.03:.1f} {S * 0.05:.1f} {sgn * S * 0.07:.1f} {S * 0.03:.1f}" '
                   f'stroke="{lip}" stroke-width="{S * 0.016:.1f}" stroke-linecap="round" fill="none"/>')
    out.append(f'<ellipse cx="{x:.1f}" cy="{ly + S * 0.035:.1f}" rx="{S * 0.045:.1f}" ry="{S * 0.03:.1f}" fill="#FFD84A"/>')
    out.append(f'<ellipse cx="{x:.1f}" cy="{y - S * 0.01:.1f}" rx="{S * 0.045:.1f}" ry="{S * 0.07:.1f}" fill="{shade(color, 0.5)}" stroke="{line}" stroke-width="{lw:.1f}"/>')
    return "".join(out)


def orchid(x, ground, h, color, lip, side=1):
    """A potted-orchid spray: two broad leaves at the foot, an arching spike with flowers and buds."""
    out = []
    for a, L, c in ((-168 if side > 0 else -12, 70, LEAF_A), (-12 if side > 0 else -168, 64, LEAF_B)):
        w = L * 0.36
        out.append(f'<path transform="translate({x:.1f} {ground - 4:.1f}) rotate({a})" fill="{c}" '
                   f'd="M0 0 C{L * 0.2:.1f} {-w:.1f} {L * 0.85:.1f} {-w:.1f} {L:.1f} 0 C{L * 0.85:.1f} {w * 0.8:.1f} {L * 0.2:.1f} {w * 0.8:.1f} 0 0Z"/>')
    tx, ty = x + side * h * 0.42, ground - h * 1.0
    cx_, cy_ = x - side * 8, ground - h * 1.3
    out.append(f'<path d="M{x:.1f} {ground - 6:.1f} Q{cx_:.1f} {cy_:.1f} {tx:.1f} {ty:.1f}" fill="none" stroke="{STEM}" stroke-width="5" stroke-linecap="round"/>')

    def at(f):
        return ((1 - f) ** 2 * x + 2 * (1 - f) * f * cx_ + f * f * tx, (1 - f) ** 2 * (ground - 6) + 2 * (1 - f) * f * cy_ + f * f * ty)
    for f, r in ((1.0, 8), (0.92, 11)):                        # buds at the tip
        bx, by = at(f)
        out.append(f'<ellipse cx="{bx:.1f}" cy="{by + 6:.1f}" rx="{r * 0.8:.1f}" ry="{r:.1f}" fill="{shade(color, -0.08)}"/>')
    for f, S in ((0.8, 58), (0.62, 66)):                       # flowers hang just under the spike, up high
        bx, by = at(f)
        out.append(orchid_flower(bx + side * 4, by + S * 0.28, S, color, lip, side * 6))
    return out


def iris_flower(x, y, S, color, beard="#FFD84A"):
    """Bearded iris from the front: three upright standards (lighter) and three falls (darker) hanging
    down and out, each fall with a pale signal patch and a yellow beard; thin darker outlines keep the
    overlapping petals apart."""
    up, fall, line = shade(color, 0.3), color, deep(color, 0.3)
    lw = S * 0.014
    out = [_rot(x - S * 0.04, y, -122, _blade(S * 0.42, S * 0.28, 1.15), up, line, lw),
           _rot(x + S * 0.04, y, -58, _blade(S * 0.42, S * 0.28, 1.15), up, line, lw),
           _rot(x, y, -90, _blade(S * 0.5, S * 0.3, 1.2), up, line, lw)]
    for a, L in ((148, 0.5), (32, 0.5), (90, 0.56)):        # side falls first, the middle one on top
        out.append(_rot(x, y + S * 0.03, a, _blade(S * L, S * 0.4, 1.25), fall, line, lw))
        out.append(_rot(x, y + S * 0.03, a, _blade(S * L * 0.55, S * 0.17), shade(fall, 0.6)))
        out.append(f'<path transform="translate({x:.1f} {y + S * 0.03:.1f}) rotate({a})" d="M{S * 0.05:.1f} 0 L{S * L * 0.4:.1f} 0" '
                   f'stroke="{beard}" stroke-width="{S * 0.055:.1f}" stroke-linecap="round"/>')
    return "".join(out)


def iris(x, ground, h, color, side=1):
    """A straight stem with one iris and sword leaves."""
    out = []
    for dx, L, a, c in ((-10, h * 0.78, -98, LEAF_A), (8, h * 0.66, -80, LEAF_B), (-2, h * 0.5, -112, LEAF_B)):
        w = 9
        out.append(f'<path transform="translate({x + dx:.1f} {ground:.1f}) rotate({a})" fill="{c}" '
                   f'd="M0 {-w:.1f} Q{L * 0.6:.1f} {-w:.1f} {L:.1f} 0 Q{L * 0.6:.1f} {w * 0.7:.1f} 0 {w:.1f}Z"/>')
    out.append(stem(x, ground, x + side * 3, ground - h + 10, 6))
    out.append(iris_flower(x + side * 3, ground - h, 80, color))
    return out


def calla(x, ground, h, color, side=1):
    """A calla lily from the side: a funnel with a turned-back lip, a yellow spadix, an arrow-shaped leaf."""
    out = []
    # arrow-shaped leaf on its own stalk
    lx, ly = x - side * 30, ground - h * 0.42
    out.append(stem(x - side * 6, ground, lx, ly + 8, 5))
    L, W = 64, 34
    out.append(f'<path transform="translate({lx:.1f} {ly:.1f}) rotate({-90 - side * 30})" fill="{LEAF_B}" '
               f'd="M0 0 C{-L * 0.08:.1f} {-W * 0.55:.1f} {L * 0.35:.1f} {-W * 0.8:.1f} {L:.1f} 0 C{L * 0.35:.1f} {W * 0.8:.1f} {-L * 0.08:.1f} {W * 0.55:.1f} 0 0Z"/>')
    out.append(f'<path transform="translate({lx:.1f} {ly:.1f}) rotate({-90 - side * 30})" d="M{L * 0.05:.1f} 0 L{L * 0.85:.1f} 0" stroke="{shade(LEAF_B, 0.45)}" stroke-width="2.2" stroke-linecap="round"/>')
    # stem and flower
    top = ground - h
    out.append(stem(x, ground, x + side * 4, top + 46, 7))
    s = side
    bx, by = x + side * 4, top + 50
    # outer spathe: base at (bx, by), opening up and towards `side`
    out.append(f'<path fill="{color}" d="M{bx:.1f} {by:.1f} '
               f'C{bx - s * 20:.1f} {by - 14:.1f} {bx - s * 30:.1f} {by - 40:.1f} {bx - s * 22:.1f} {by - 62:.1f} '
               f'C{bx - s * 14:.1f} {by - 80:.1f} {bx + s * 6:.1f} {by - 82:.1f} {bx + s * 26:.1f} {by - 74:.1f} '
               f'C{bx + s * 40:.1f} {by - 68:.1f} {bx + s * 44:.1f} {by - 58:.1f} {bx + s * 30:.1f} {by - 52:.1f} '
               f'C{bx + s * 20:.1f} {by - 40:.1f} {bx + s * 12:.1f} {by - 16:.1f} {bx:.1f} {by:.1f}Z"/>')
    # inner throat
    out.append(f'<path fill="{shade(color, -0.14)}" d="M{bx - s * 16:.1f} {by - 60:.1f} '
               f'C{bx - s * 6:.1f} {by - 72:.1f} {bx + s * 14:.1f} {by - 70:.1f} {bx + s * 26:.1f} {by - 62:.1f} '
               f'C{bx + s * 16:.1f} {by - 54:.1f} {bx + s * 4:.1f} {by - 40:.1f} {bx - s * 2:.1f} {by - 30:.1f} '
               f'C{bx - s * 8:.1f} {by - 40:.1f} {bx - s * 14:.1f} {by - 50:.1f} {bx - s * 16:.1f} {by - 60:.1f}Z"/>')
    # spadix
    out.append(f'<path d="M{bx + s * 1:.1f} {by - 34:.1f} Q{bx + s * 3:.1f} {by - 50:.1f} {bx + s * 9:.1f} {by - 62:.1f}" '
               f'stroke="#FFD84A" stroke-width="7" stroke-linecap="round" fill="none"/>')
    # the curled lip highlight
    out.append(f'<path d="M{bx + s * 24:.1f} {by - 72:.1f} Q{bx + s * 38:.1f} {by - 66:.1f} {bx + s * 31:.1f} {by - 54:.1f}" '
               f'stroke="{shade(color, 0.35) if color != "#FFFFFF" else "#E6E9F2"}" stroke-width="3" stroke-linecap="round" fill="none"/>')
    return out


# ---------- rose, peony, sunflower, poppy, hydrangea, carnation, crocus ----------
BROWN = "#7A4B2E"


def rose(x, y, d, color, rot=0.0):
    """A rose from above: three rings of round petals, darker towards the middle, and a curl in the centre."""
    R, out = d / 2, []
    for k, (r, n, a) in enumerate(((1.0, 5, 0), (0.72, 5, 36), (0.46, 4, 12))):
        out.append(f'<path fill="{color if k % 2 == 0 else deep(color)}" stroke="{deep(color)}" stroke-width="{R * 0.03:.1f}" '
                   f'd="{_petals(x, y, R * r, n, 0.55, rot + a, notch=False)}"/>')
    out.append(_disc(x, y, R * 0.22, deep(color)))
    out.append(f'<path d="M{x - R * 0.12:.1f} {y:.1f} A{R * 0.12:.1f} {R * 0.12:.1f} 0 1 1 {x + R * 0.05:.1f} {y + R * 0.1:.1f}" '
               f'fill="none" stroke="{shade(color, 0.35)}" stroke-width="{R * 0.05:.1f}" stroke-linecap="round"/>')
    return "".join(out)


def peony(x, y, d, color, rot=0.0):
    """A full peony: two rings of broad notched petals, a lighter heart, golden stamens."""
    R, out = d / 2, []
    out.append(f'<path fill="{deep(color)}" d="{_petals(x, y, R, 9, 0.42, rot)}"/>')
    out.append(f'<path fill="{color}" d="{_petals(x, y, R * 0.8, 9, 0.44, rot + 20)}"/>')
    out.append(f'<path fill="{shade(color, 0.35)}" d="{_petals(x, y, R * 0.52, 7, 0.5, rot + 8)}"/>')
    for i in range(7):
        t = 2 * math.pi * i / 7 + math.radians(rot)
        out.append(_disc(x + R * 0.14 * math.cos(t), y + R * 0.14 * math.sin(t), R * 0.06, "#FFD84A"))
    return "".join(out)


def sunflower(x, y, d, rot=0.0):
    """Sunflower: two rings of pointed yellow petals and a big brown middle with a seed ring."""
    R = d / 2
    return (f'<path fill="#F5A623" d="{_petals(x, y, R * 0.94, 14, 0.12, rot + 12.9, notch=False)}"/>'
            f'<path fill="#FFD84A" d="{_petals(x, y, R, 14, 0.11, rot, notch=False)}"/>'
            + _disc(x, y, R * 0.44, BROWN) + _disc(x, y, R * 0.3, shade(BROWN, -0.3))
            + "".join(_disc(x + R * 0.37 * math.cos(2 * math.pi * i / 12), y + R * 0.37 * math.sin(2 * math.pi * i / 12), R * 0.035, "#F5A623") for i in range(12)))


def poppy(x, y, d, color, rot=0.0):
    """Poppy: four big round petals, a dark middle with a ring of stamens."""
    R, out = d / 2, []
    for a in (0, 90, 180, 270):                           # back petals
        out.append(_rot(x, y, rot + a, _blade(R * 0.95, R * 0.95, 1.35), deep(color)))
    for a in (45, 135, 225, 315):                         # front petals
        out.append(_rot(x, y, rot + a, _blade(R * 0.9, R * 0.9, 1.35), color))
    out.append(_disc(x, y, R * 0.3, "#14204A"))
    for i in range(10):
        t = 2 * math.pi * i / 10
        out.append(_disc(x + R * 0.3 * math.cos(t), y + R * 0.3 * math.sin(t), R * 0.05, "#14204A"))
    out.append(_disc(x, y, R * 0.13, shade("#14204A", 0.45)))
    return "".join(out)


def hydrangea(x, y, d, color, rot=0.0):
    """Hydrangea: a dome of small four-petal florets in two tones."""
    R, out = d / 2, [_disc(x, y, d * 0.48, deep(color))]
    pts = [(0, 0)] + [(0.33 * math.cos(2 * math.pi * i / 6), 0.33 * math.sin(2 * math.pi * i / 6)) for i in range(6)] \
        + [(0.66 * math.cos(2 * math.pi * i / 11 + 0.3), 0.66 * math.sin(2 * math.pi * i / 11 + 0.3)) for i in range(11)]
    for i, (px, py) in enumerate(pts):
        c = color if i % 3 else shade(color, 0.3)
        fx, fy = x + R * px, y + R * py
        out.append(f'<path fill="{c}" d="{_petals(fx, fy, R * 0.26, 4, 0.55, rot + i * 17, notch=False)}"/>' + _disc(fx, fy, R * 0.045, deep(color)))
    return "".join(out)


def carnation(x, y, d, color):
    """A carnation from the side: a fan of frilled petals on a green calyx; (x, y) is the top of the stem."""
    R, pts = d / 2, []
    for i in range(25):                                  # frilled top edge, a half fan
        t = math.pi + math.pi * i / 24
        r = R * (0.95 if i % 2 == 0 else 0.78)
        pts.append((x + r * math.cos(t), y - R * 0.15 + r * math.sin(t) * 0.8))
    pts += [(x + R * 0.3, y + R * 0.05), (x - R * 0.3, y + R * 0.05)]
    inner = [(x + R * 0.62 * math.cos(math.pi + math.pi * i / 12), y - R * 0.15 + R * 0.55 * math.sin(math.pi + math.pi * i / 12) * (0.8 if i % 2 else 0.95)) for i in range(13)]
    inner += [(x + R * 0.2, y), (x - R * 0.2, y)]
    return (f'<path fill="{color}" d="{_poly(pts)}" stroke="{color}" stroke-width="2" stroke-linejoin="round"/>'
            f'<path fill="{deep(color)}" d="{_poly(inner)}"/>'
            f'<path fill="{LEAF_A}" d="M{x - R * 0.28:.1f} {y - R * 0.02:.1f} L{x + R * 0.28:.1f} {y - R * 0.02:.1f} L{x + R * 0.14:.1f} {y + R * 0.6:.1f} L{x - R * 0.14:.1f} {y + R * 0.6:.1f}Z"/>')


def crocus(x, ground, h, color, side=1):
    """A short crocus: a cup of three petals on a short stem, grassy leaves, orange stamens."""
    top = ground - h
    out = []
    for dx, a in ((-8, -100), (6, -80), (0, -92)):
        out.append(f'<path transform="translate({x + dx:.1f} {ground:.1f}) rotate({a})" fill="{LEAF_B}" d="M0 -3 Q{h * 0.5:.1f} -4 {h * 0.85:.1f} 0 Q{h * 0.5:.1f} 3 0 3Z"/>')
    out.append(stem(x, ground, x, top + 30, 6))
    c, dk = color, deep(color)
    out.append(f'<path fill="{dk}" d="M{x - 18:.1f} {top + 4:.1f} C{x - 22:.1f} {top + 26:.1f} {x - 10:.1f} {top + 38:.1f} {x:.1f} {top + 38:.1f} '
               f'C{x + 10:.1f} {top + 38:.1f} {x + 22:.1f} {top + 26:.1f} {x + 18:.1f} {top + 4:.1f} C{x + 10:.1f} {top + 14:.1f} {x - 10:.1f} {top + 14:.1f} {x - 18:.1f} {top + 4:.1f}Z"/>')
    out.append(f'<path fill="{c}" d="M{x:.1f} {top - 6:.1f} C{x - 13:.1f} {top + 6:.1f} {x - 12:.1f} {top + 30:.1f} {x:.1f} {top + 38:.1f} '
               f'C{x + 12:.1f} {top + 30:.1f} {x + 13:.1f} {top + 6:.1f} {x:.1f} {top - 6:.1f}Z"/>')
    out.append(f'<path d="M{x - 4:.1f} {top + 6:.1f} L{x - 6:.1f} {top - 4:.1f} M{x + 4:.1f} {top + 6:.1f} L{x + 6:.1f} {top - 4:.1f}" stroke="#F5A623" stroke-width="3" stroke-linecap="round"/>')
    return out
