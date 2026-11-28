"""Hand-drawn looking pieces for the cute cards: wobbly strokes, crayon fills, a cat, a frog, hearts, bows.
Everything is vector (no raster filters), in mm, so it prints sharp."""
import math
import random

NAVY_INK, BROWN_INK = "#1E2340", "#6E4B3C"


def smooth(pts, closed=True):
    """Catmull-Rom through the points -> cubic path."""
    n = len(pts)
    if n < 3:
        return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts)
    d = f"M{pts[0][0]:.2f} {pts[0][1]:.2f}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[i - 1] if (closed or i > 0) else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
    return d + ("Z" if closed else "")


def wobble(pts, amt, rnd):
    return [(x + rnd.uniform(-amt, amt), y + rnd.uniform(-amt, amt)) for x, y in pts]


def resample(pts, step, closed=True):
    out = []
    seq = pts + ([pts[0]] if closed else [])
    for (x0, y0), (x1, y1) in zip(seq, seq[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(L / step))
        out += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    if not closed:
        out.append(seq[-1])
    return out


def ink(pts, color, w, closed=True, rnd=None, amt=0.25, passes=1, fill="none"):
    """A slightly wobbly pen line; passes > 1 = sketchy double line."""
    rnd = rnd or random.Random(1)
    out = []
    for p in range(passes):
        q = wobble(resample(pts, 3.0, closed), amt * (1 + p * 0.6), rnd)
        out.append(f'<path d="{smooth(q, closed)}" fill="{fill if p == 0 else "none"}" stroke="{color}" '
                   f'stroke-width="{w * (1 if p == 0 else 0.6):.2f}" stroke-linecap="round" stroke-linejoin="round"'
                   f'{"" if p == 0 else " stroke-opacity=\"0.7\""}/>')
    return "".join(out)


def ellipse_pts(cx, cy, rx, ry, n=36, rot=0.0):
    a0 = math.radians(rot)
    return [(cx + rx * math.cos(t) * math.cos(a0) - ry * math.sin(t) * math.sin(a0),
             cy + rx * math.cos(t) * math.sin(a0) + ry * math.sin(t) * math.cos(a0))
            for t in (2 * math.pi * i / n for i in range(n))]


def heart_pts(cx, cy, s, n=80):
    """Classic heart curve, s = half width in mm."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * s / 16, cy - y * s / 16))
    return pts


def crayon(clip_id, shape_d, base, strokes, x0, y0, x1, y1, seed=3, w=1.1, n=420, angle=-70):
    """Crayon fill: a base tint + many short jagged strokes, clipped to the shape (all vector)."""
    rnd = random.Random(seed)
    out = [f'<defs><clipPath id="{clip_id}"><path d="{shape_d}"/></clipPath></defs><g clip-path="url(#{clip_id})">',
           f'<path d="{shape_d}" fill="{base}"/>']
    a = math.radians(angle)
    for _ in range(n):
        cx, cy = rnd.uniform(x0 - 5, x1 + 5), rnd.uniform(y0 - 5, y1 + 5)
        L = rnd.uniform(6, 16)
        pts = []
        for k in range(5):
            t = (k / 4 - 0.5) * L
            pts.append((cx + t * math.cos(a) + rnd.uniform(-0.8, 0.8), cy + t * math.sin(a) + rnd.uniform(-0.8, 0.8)))
        out.append(f'<path d="M' + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) +
                   f'" fill="none" stroke="{rnd.choice(strokes)}" stroke-width="{w * rnd.uniform(0.7, 1.3):.2f}" '
                   f'stroke-linecap="round" stroke-opacity="{rnd.uniform(0.45, 0.95):.2f}"/>')
    out.append("</g>")
    return "".join(out)


def scribble_rect(x0, y0, x1, y1, colors, seed=5, w=1.5):
    """Zig-zag crayon scribble filling a rectangle with ragged edges (like the pink card)."""
    rnd = random.Random(seed)
    out = []
    for layer in range(3):
        x = x0 + rnd.uniform(-1, 1)
        pts = []
        while x < x1:
            pts.append((x, y0 + rnd.uniform(-3, 3)))
            x += rnd.uniform(1.2, 2.2)
            pts.append((x, y1 + rnd.uniform(-3, 3)))
            x += rnd.uniform(1.2, 2.2)
        out.append(f'<path d="M' + " L".join(f"{px:.2f} {py:.2f}" for px, py in pts) +
                   f'" fill="none" stroke="{colors[layer % len(colors)]}" stroke-width="{w:.2f}" stroke-linejoin="round" '
                   f'stroke-opacity="{0.85 - layer * 0.2:.2f}"/>')
    return "".join(out)


def star_pts(cx, cy, R, n=5, inner=0.45, rot=0.0):
    return [(cx + (R if i % 2 == 0 else R * inner) * math.sin(math.radians(rot) + math.pi * i / n),
             cy - (R if i % 2 == 0 else R * inner) * math.cos(math.radians(rot) + math.pi * i / n)) for i in range(2 * n)]


# ---------------------------------------------------------------- characters
def party_cat(cx, cy, s=1.0, ink_c=NAVY_INK, seed=7):
    """Front-facing white cat with a starry party hat, raising a paw with a star wand. (cx, cy) = head centre."""
    rnd = random.Random(seed)
    P = lambda x, y: (cx + x * s, cy + y * s)
    out = []
    # raised arm (behind the head edge) + wand
    arm = [P(12, 8), P(20, -2), P(27, -14), P(31, -19), P(35, -17), P(34, -11), P(28, 0), P(22, 12)]
    wand_top = P(42, -58)
    out.append(ink([P(32, -17), wand_top], ink_c, 0.7 * s, closed=False, rnd=rnd, amt=0.15))
    sp = star_pts(*P(42, -58), 9 * s, 5, 0.48, 8)
    out.append(ink(sp, ink_c, 0.7 * s, rnd=rnd, amt=0.2, fill="#F7D45A"))
    for ang in (20, 95, 160, 235, 300):
        a = math.radians(ang)
        x0, y0 = wand_top[0] + 12 * s * math.cos(a), wand_top[1] + 12 * s * math.sin(a)
        out.append(f'<path d="M{x0:.2f} {y0:.2f} l{2.6 * s * math.cos(a):.2f} {2.6 * s * math.sin(a):.2f}" stroke="#F2B53C" '
                   f'stroke-width="{0.8 * s:.2f}" stroke-linecap="round"/>')
    out.append(ink(arm, ink_c, 0.75 * s, rnd=rnd, fill="#FFFFFF"))
    for dx in (-1.5, 0.5, 2.5):
        out.append(ink([P(31 + dx, -19), P(31.5 + dx, -16)], ink_c, 0.5 * s, closed=False, rnd=rnd, amt=0.1))
    # body hint
    out.append(ink([P(-14, 10), P(-18, 24), P(-6, 30), P(14, 30), P(22, 22), P(16, 10)], ink_c, 0.75 * s, rnd=rnd, fill="#FFFFFF"))
    # ears + head
    head = ellipse_pts(cx, cy, 20 * s, 14.5 * s, 40)
    out.append(ink([P(-17, -6), P(-19, -23), P(-6, -13)], ink_c, 0.75 * s, rnd=rnd, fill="#FFFFFF"))
    out.append(ink([P(17, -6), P(19, -23), P(6, -13)], ink_c, 0.75 * s, rnd=rnd, fill="#FFFFFF"))
    out.append(ink(head, ink_c, 0.8 * s, rnd=rnd, fill="#FFFFFF"))
    out.append(ink([P(-15.5, -9), P(-16.5, -18), P(-9, -12.5)], "#F6B9C4", 0.9 * s, closed=False, rnd=rnd, amt=0.1))
    out.append(ink([P(15.5, -9), P(16.5, -18), P(9, -12.5)], "#F6B9C4", 0.9 * s, closed=False, rnd=rnd, amt=0.1))
    # face
    for ex in (-6.5, 6.5):
        out.append(f'<ellipse cx="{cx + ex * s:.2f}" cy="{cy - 1 * s:.2f}" rx="{1.4 * s:.2f}" ry="{1.7 * s:.2f}" fill="{ink_c}"/>')
        out.append(f'<circle cx="{cx + (ex + 0.4) * s:.2f}" cy="{cy - 1.6 * s:.2f}" r="{0.45 * s:.2f}" fill="#FFFFFF"/>')
    for bx in (-11, 11):
        for k in (-1, 0, 1):
            out.append(f'<path d="M{cx + (bx + k * 1.3) * s:.2f} {cy + 3.2 * s:.2f} l{0.5 * s:.2f} {1.4 * s:.2f}" stroke="#E8604C" '
                       f'stroke-width="{0.75 * s:.2f}" stroke-linecap="round"/>')
    out.append(f'<path d="M{cx - 1.3 * s:.2f} {cy + 1.6 * s:.2f} Q{cx:.2f} {cy + 1.0 * s:.2f} {cx + 1.3 * s:.2f} {cy + 1.6 * s:.2f} '
               f'L{cx:.2f} {cy + 3.0 * s:.2f}Z" fill="#E8604C" stroke="{ink_c}" stroke-width="{0.4 * s:.2f}" stroke-linejoin="round"/>')
    out.append(ink([P(-3, 4.8), P(-1.5, 6), P(0, 3.4), P(1.5, 6), P(3, 4.8)], ink_c, 0.6 * s, closed=False, rnd=rnd, amt=0.08))
    for side in (-1, 1):
        for k, (dy, ln) in enumerate(((1.5, 13), (4, 14), (6.5, 11))):
            out.append(ink([P(side * 13, dy), P(side * (13 + ln), dy + (k - 1) * 3)], ink_c, 0.45 * s, closed=False, rnd=rnd, amt=0.15))
    # party hat with stars + pompom flower
    hat = [P(-11, -12), P(3, -15.5), P(-7, -42)]
    out.append(ink(hat, ink_c, 0.75 * s, rnd=rnd, fill="#FFFDF4"))
    for (hx, hy, r, rot) in ((-5, -19, 3.4, 10), (-2.5, -28, 2.6, -15), (-7.5, -32, 2.0, 25), (0.5, -18, 1.6, 0)):
        out.append(ink(star_pts(*P(hx, hy), r * s, 5, 0.5, rot), "#E5A92D", 0.25 * s, rnd=rnd, amt=0.05, fill="#F7D45A"))
    for k in range(6):
        a = math.radians(k * 60 + 15)
        px, py = P(-7, -44)
        out.append(ink(ellipse_pts(px + 2.4 * s * math.cos(a), py + 2.4 * s * math.sin(a), 2.2 * s, 1.0 * s, 16, k * 60 + 15),
                       ink_c, 0.45 * s, rnd=rnd, amt=0.05, fill="#FFFFFF"))
    return "".join(out)


def sketch_cat(x, y, s=1.0, ink_c=BROWN_INK, seed=11):
    """A sitting cat in thin pencil lines with a red hatched party hat and a red ribbon. (x, y) = top of head."""
    rnd = random.Random(seed)
    P = lambda a, b: (x + a * s, y + b * s)
    out = []
    line = lambda pts, w=0.35, closed=False, fill="none": ink(pts, ink_c, w * s, closed, rnd, 0.18, 2, fill)
    # body + tail
    out.append(line([P(-6, 22), P(-12, 38), P(-14, 56), P(-10, 68), P(-2, 72), P(12, 72), P(22, 70), P(26, 62), P(22, 44), P(14, 28), P(8, 22)]))
    out.append(line([P(24, 66), P(34, 70), P(46, 66), P(52, 58)]))
    out.append(line([P(-2, 46), P(-3, 62), P(-1, 71)]))
    out.append(line([P(6, 46), P(7, 62), P(6, 71)]))
    for px in (-3, 4):
        out.append(line([P(px - 2, 71), P(px, 69), P(px + 2, 71), P(px + 4, 69), P(px + 6, 71)], 0.3))
    # head + ears
    out.append(line([P(-14, 10), P(-15, 2), P(-12, -8), P(-12, -18), P(-6, -10), P(0, -11), P(6, -10), P(12, -17), P(13, -7), P(16, 3), P(13, 13), P(6, 19), P(-4, 20), P(-11, 16), P(-14, 10)]))
    for ex in (-6, 5):
        out.append(ink(ellipse_pts(*P(ex, 2), 2.2 * s, 2.6 * s, 20), ink_c, 0.35 * s, True, rnd, 0.05, 1))
        out.append(f'<circle cx="{P(ex, 2.4)[0]:.2f}" cy="{P(ex, 2.4)[1]:.2f}" r="{1.3 * s:.2f}" fill="{ink_c}"/>')
    out.append(line([P(-1.5, 8), P(0, 9.5), P(1.5, 8)], 0.35))
    out.append(line([P(0, 9.5), P(-1.5, 12), P(-3, 11.5)], 0.3))
    out.append(line([P(0, 9.5), P(1.5, 12), P(3, 11.5)], 0.3))
    for side in (-1, 1):
        for k in range(3):
            out.append(line([P(side * 7, 10 + k), P(side * (22 + k * 2), 7 + k * 4)], 0.2))
    # red ribbon round the neck + bow
    red = "#C0392B"
    out.append(ink([P(-13, 13), P(-4, 21), P(8, 20), P(15, 12)], red, 0.45 * s, False, rnd, 0.1, 2))
    out.append(ink([P(-8, 19), P(-12, 24), P(-8, 25), P(-8, 19)], red, 0.4 * s, False, rnd, 0.1, 1))
    out.append(ink([P(-8, 19), P(-4, 24), P(-7, 26), P(-8, 19)], red, 0.4 * s, False, rnd, 0.1, 1))
    out.append(ink([P(-8, 19), P(-11, 30)], red, 0.4 * s, False, rnd, 0.1, 1))
    out.append(ink([P(-8, 19), P(-6, 31)], red, 0.4 * s, False, rnd, 0.1, 1))
    # hatched party hat
    hat = [P(-2, -12), P(16, -18), P(14, -34)]
    hd = smooth(wobble(resample(hat, 3, True), 0.15, rnd))
    out.append(f'<defs><clipPath id="hat{seed}"><path d="{hd}"/></clipPath></defs><g clip-path="url(#hat{seed})">')
    for k in range(-30, 40):
        x0 = x + k * 0.9 * s
        out.append(f'<path d="M{x0:.2f} {y - 40 * s:.2f} L{x0 + 22 * s:.2f} {y - 8 * s:.2f}" stroke="{red}" stroke-width="{0.35 * s:.2f}" stroke-opacity="0.85"/>')
        out.append(f'<path d="M{x0:.2f} {y - 8 * s:.2f} L{x0 + 14 * s:.2f} {y - 40 * s:.2f}" stroke="{red}" stroke-width="{0.25 * s:.2f}" stroke-opacity="0.6"/>')
    out.append("</g>")
    out.append(f'<path d="{hd}" fill="none" stroke="{red}" stroke-width="{0.45 * s:.2f}"/>')
    out.append(ink([P(-1, -12), P(-10, 4), P(-12, 12)], red, 0.3 * s, False, rnd, 0.1, 1))
    return "".join(out)


def frog(x, y, s=1.0, seed=4, reach=None):
    """A round little frog (body centre x, y) with one long arm to the right; returns svg + the hand point."""
    green, dark = "#8DB35A", "#3B4A2A"
    out = []
    body = [(x - 13 * s, y + 9 * s), (x - 14 * s, y - 2 * s), (x - 10 * s, y - 9 * s), (x - 8 * s, y - 14 * s), (x - 3 * s, y - 14 * s),
            (x - 1 * s, y - 10 * s), (x + 3 * s, y - 10 * s), (x + 5 * s, y - 14 * s), (x + 10 * s, y - 14 * s), (x + 12 * s, y - 9 * s),
            (x + 15 * s, y - 2 * s), (x + 14 * s, y + 9 * s), (x + 9 * s, y + 13 * s), (x + 5 * s, y + 11 * s), (x - 5 * s, y + 11 * s),
            (x - 9 * s, y + 13 * s)]
    hand = reach or (x + 33 * s, y - 3 * s)
    out.append(f'<path d="M{x + 10 * s:.2f} {y - 1 * s:.2f} Q{(x + hand[0]) / 2 + 4 * s:.2f} {y - 1 * s:.2f} {hand[0]:.2f} {hand[1]:.2f}" fill="none" '
               f'stroke="{green}" stroke-width="{3 * s:.2f}" stroke-linecap="round"/>')
    out.append(f'<circle cx="{hand[0]:.2f}" cy="{hand[1]:.2f}" r="{2.1 * s:.2f}" fill="{green}"/>')
    out.append(f'<path d="{smooth(body)}" fill="{green}"/>')
    for ex in (-5.5, 7.5):
        out.append(f'<circle cx="{x + ex * s:.2f}" cy="{y - 10.5 * s:.2f}" r="{1.1 * s:.2f}" fill="{dark}"/>')
    for bx in (-8, 10):
        out.append(f'<ellipse cx="{x + bx * s:.2f}" cy="{y - 4 * s:.2f}" rx="{2.6 * s:.2f}" ry="{1.6 * s:.2f}" fill="#E8A58F" fill-opacity="0.8"/>')
    out.append(f'<path d="M{x - 1.5 * s:.2f} {y - 7 * s:.2f} Q{x + 1 * s:.2f} {y - 2.5 * s:.2f} {x + 3.5 * s:.2f} {y - 7 * s:.2f}" fill="none" '
               f'stroke="{dark}" stroke-width="{0.6 * s:.2f}" stroke-linecap="round"/>')
    return "".join(out), hand


def face_heart(cx, cy, s, color="#D8333A", seed=2):
    """Red heart with big googly eyes looking up and a tiny smile."""
    rnd = random.Random(seed)
    out = [f'<path d="{smooth(heart_pts(cx, cy, s, 90))}" fill="{color}"/>']
    for ex, ey, r in ((-0.28, 0.02, 0.17), (0.25, -0.08, 0.19)):
        X, Y = cx + ex * s, cy + ey * s
        out.append(f'<ellipse cx="{X:.2f}" cy="{Y:.2f}" rx="{r * s * 0.85:.2f}" ry="{r * s:.2f}" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="{0.03 * s:.2f}"/>')
        out.append(f'<ellipse cx="{X + 0.02 * s:.2f}" cy="{Y - r * s * 0.4:.2f}" rx="{r * s * 0.6:.2f}" ry="{r * s * 0.5:.2f}" fill="#1A1A1A"/>')
    out.append(f'<path d="M{cx - 0.06 * s:.2f} {cy + 0.12 * s:.2f} Q{cx:.2f} {cy + 0.2 * s:.2f} {cx + 0.07 * s:.2f} {cy + 0.11 * s:.2f}" fill="none" '
               f'stroke="#1A1A1A" stroke-width="{0.03 * s:.2f}" stroke-linecap="round"/>')
    return "".join(out)


def bow(cx, cy, s, color, seed=1, flip=False):
    """A ribbon bow drawn with a double pen line: two loops, a knot and two tails."""
    rnd = random.Random(seed)
    k = -1 if flip else 1
    out = []
    for side in (-1, 1):
        loop = [(cx, cy), (cx + side * 6 * s, cy - 5 * s * k), (cx + side * 12 * s, cy - 4 * s * k), (cx + side * 12 * s, cy + 2 * s * k), (cx + side * 6 * s, cy + 1 * s * k)]
        out.append(ink(loop, color, 0.45, True, rnd, 0.15, 2))
        tail = [(cx, cy + 1 * s * k), (cx + side * 4 * s, cy + 7 * s * k), (cx + side * 6 * s, cy + 12 * s * k)]
        out.append(ink(tail, color, 0.45, False, rnd, 0.15, 2))
    out.append(ink(ellipse_pts(cx, cy, 2 * s, 1.8 * s, 14), color, 0.45, True, rnd, 0.1, 1))
    return "".join(out)


def ribbon_frame(x0, y0, x1, y1, color, seed=6):
    """Wavy double ribbon round the card with bows at top and bottom (after the 'happy birthday' reference)."""
    rnd = random.Random(seed)
    out = []

    def edge(pts):
        for off in (-0.9, 0.9):
            q = [(px + off * 0.4, py + off) for px, py in pts]
            out.append(ink(q, color, 0.45, False, rnd, 0.2, 1))
    cxm = (x0 + x1) / 2
    n = 6
    left = [(x0 + 2.5 * math.sin(i * 1.3), y0 + (y1 - y0) * i / n) for i in range(n + 1)]
    right = [(x1 + 2.5 * math.sin(i * 1.1 + 1), y0 + (y1 - y0) * i / n) for i in range(n + 1)]
    top_l = [(x0 + (cxm - 13 - x0) * i / 4, y0 + 2.5 * math.sin(i * 1.6)) for i in range(5)]
    top_r = [(cxm + 13 + (x1 - cxm - 13) * i / 4, y0 + 2.5 * math.sin(i * 1.6 + 1)) for i in range(5)]
    bot_l = [(x0 + (cxm - 13 - x0) * i / 4, y1 + 2.5 * math.sin(i * 1.4)) for i in range(5)]
    bot_r = [(cxm + 13 + (x1 - cxm - 13) * i / 4, y1 + 2.5 * math.sin(i * 1.4 + 2)) for i in range(5)]
    for e in (left, right, top_l, top_r, bot_l, bot_r):
        edge(e)
    out.append(bow(cxm, y0, 1.25, color, seed + 1))
    out.append(bow(cxm, y1, 1.25, color, seed + 2, flip=True))
    for (px, py) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        out.append(ink(ellipse_pts(px, py, 4, 2.4, 18, 30), color, 0.45, True, rnd, 0.15, 1))
    return "".join(out)


def hugger(x, y, s=1.0, seed=8):
    """A little person peeking from behind a heart: curly hair, striped vest. (x, y) = face centre."""
    rnd = random.Random(seed)
    P = lambda a, b: (x + a * s, y + b * s)
    ink_c = "#1A1A1A"
    out = []
    # legs + shoes
    out.append(ink([P(-3, 22), P(-5, 44), P(1, 45), P(3, 30), P(5, 45), P(11, 44), P(9, 22)], ink_c, 0.45 * s, True, rnd, 0.15, 1, "#22325E"))
    out.append(ink([P(-6, 44), P(-7, 48), P(2, 48), P(1, 44)], ink_c, 0.45 * s, True, rnd, 0.1, 1, "#1A1A1A"))
    out.append(ink([P(5, 44), P(5, 48), P(13, 48), P(11, 44)], ink_c, 0.45 * s, True, rnd, 0.1, 1, "#1A1A1A"))
    # torso (cream shirt) + vest with stripes
    torso = [P(-5, 6), P(9, 6), P(12, 24), P(-4, 24)]
    out.append(ink(torso, ink_c, 0.45 * s, True, rnd, 0.15, 1, "#F1E6CF"))
    vest = [P(-4, 8), P(1, 15), P(7, 8), P(10, 22), P(-3, 22)]
    vd = smooth(wobble(resample(vest, 2, True), 0.1, rnd))
    out.append(f'<path d="{vd}" fill="#C9A86A"/>')
    out.append(f'<defs><clipPath id="vest{seed}"><path d="{vd}"/></clipPath></defs><g clip-path="url(#vest{seed})">')
    for k in range(-4, 14):
        xx = x + k * 1.2 * s
        out.append(f'<path d="M{xx:.2f} {y:.2f} L{xx + 2 * s:.2f} {y + 26 * s:.2f}" stroke="#C0472F" stroke-width="{0.3 * s:.2f}"/>')
    out.append("</g>")
    # arm reaching left over the heart + hand
    out.append(ink([P(-4, 9), P(-14, 12), P(-20, 14), P(-20, 17), P(-12, 16), P(-3, 14)], ink_c, 0.45 * s, True, rnd, 0.12, 1, "#F1E6CF"))
    out.append(ink([P(-20, 13), P(-25, 11), P(-27, 14), P(-25, 18), P(-20, 18)], ink_c, 0.45 * s, True, rnd, 0.1, 1, "#F2B8A6"))
    # head + curly hair
    out.append(ink(ellipse_pts(x, y, 5 * s, 6 * s, 24), ink_c, 0.45 * s, True, rnd, 0.1, 1, "#F2B8A6"))
    for k in range(9):
        a = math.radians(200 + k * 20)
        out.append(ink(ellipse_pts(x + 5.2 * s * math.cos(a), y - 1 * s + 5.4 * s * math.sin(a), 1.8 * s, 1.6 * s, 12), ink_c, 0.4 * s, True, rnd, 0.05, 1, "#1A1A1A"))
    out.append(f'<circle cx="{x - 1.6 * s:.2f}" cy="{y + 0.2 * s:.2f}" r="{0.5 * s:.2f}" fill="{ink_c}"/>')
    out.append(f'<circle cx="{x + 1.8 * s:.2f}" cy="{y + 0.2 * s:.2f}" r="{0.5 * s:.2f}" fill="{ink_c}"/>')
    out.append(ink([P(-2, 2.6), P(0, 3.8), P(2, 2.6)], ink_c, 0.4 * s, False, rnd, 0.05, 1))
    return "".join(out), P(-26, 14)


def mitten_hand(x, y, s=1.0, flip=False, seed=9):
    """A cartoon hand (pink, black outline) gripping an edge: four short fingers."""
    rnd = random.Random(seed)
    k = -1 if flip else 1
    pts = [(x, y - 3 * s), (x + k * 3 * s, y - 5 * s), (x + k * 6 * s, y - 4 * s), (x + k * 8 * s, y - 2 * s), (x + k * 8 * s, y + 1 * s),
           (x + k * 7 * s, y + 3 * s), (x + k * 4 * s, y + 4 * s), (x, y + 3 * s)]
    out = [ink(pts, "#1A1A1A", 0.45 * s, True, rnd, 0.1, 1, "#F2B8A6")]
    for f in (-1.5, 0.5, 2.5):
        out.append(ink([(x + k * 6 * s, y + f * s), (x + k * 8.2 * s, y + f * s)], "#1A1A1A", 0.35 * s, False, rnd, 0.05, 1))
    return "".join(out)


def pencil(pts, color, w, rnd, closed=False, amt=0.12):
    """Two light pencil passes along a smooth curve through the points."""
    out = []
    for p in range(2):
        q = wobble(pts, amt * (1 + p), rnd)
        out.append(f'<path d="{smooth(q, closed)}" fill="none" stroke="{color}" stroke-width="{w * (1 if p == 0 else 0.55):.2f}" '
                   f'stroke-linecap="round" stroke-linejoin="round" stroke-opacity="{0.95 if p == 0 else 0.55}"/>')
    return "".join(out)


def sketch_cat2(x, y, s=1.0, ink_c=BROWN_INK, red="#C0392B", seed=21):
    """A soft, round sitting kitten in pencil, head slightly tilted, red party hat on top and a red bow. (x, y) = head centre."""
    rnd = random.Random(seed)
    P = lambda a, b: (x + a * s, y + b * s)
    w = 0.42 * s
    out = []
    # tail curling round the feet (behind)
    out.append(pencil([P(14, 58), P(24, 60), P(32, 55), P(33, 46), P(29, 40)], ink_c, w, rnd))
    # body
    out.append(pencil([P(-9, 11), P(-14, 22), P(-18, 38), P(-18, 51), P(-13, 59), P(-5, 62)], ink_c, w, rnd))
    out.append(pencil([P(9, 11), P(14, 22), P(19, 36), P(21, 49), P(18, 57), P(10, 62)], ink_c, w, rnd))
    out.append(pencil([P(-5, 62), P(2, 63), P(10, 62)], ink_c, w * 0.8, rnd))
    # front legs + paws
    out.append(pencil([P(-6, 30), P(-7, 45), P(-7, 59)], ink_c, w * 0.8, rnd))
    out.append(pencil([P(4, 30), P(5, 45), P(5, 59)], ink_c, w * 0.8, rnd))
    out.append(pencil(ellipse_pts(*P(-9.5, 60.5), 4 * s, 2 * s, 16), ink_c, w * 0.8, rnd, True))
    out.append(pencil(ellipse_pts(*P(7.5, 60.5), 4 * s, 2 * s, 16), ink_c, w * 0.8, rnd, True))
    # head (tilted) + ears
    head = [P(-15, 2), P(-16, -6), P(-13, -13), P(-14, -25), P(-6, -16), P(0, -17), P(6, -16), P(14, -25), P(13, -13),
            P(16, -5), P(15, 4), P(9, 11), P(0, 13), P(-9, 11)]
    g = f'<g transform="rotate(-8 {x:.2f} {y:.2f})">'
    g += pencil(head, ink_c, w, rnd, True)
    g += pencil([P(-12, -14), P(-12.5, -21), P(-8, -16)], ink_c, w * 0.6, rnd)
    g += pencil([P(12, -14), P(12.5, -21), P(8, -16)], ink_c, w * 0.6, rnd)
    for ex in (-6, 6):
        g += pencil(ellipse_pts(*P(ex, 0), 2.6 * s, 3.0 * s, 20), ink_c, w * 0.7, rnd, True, 0.05)
        g += f'<ellipse cx="{P(ex, 0.4)[0]:.2f}" cy="{P(ex, 0.4)[1]:.2f}" rx="{1.4 * s:.2f}" ry="{2.0 * s:.2f}" fill="{ink_c}"/>'
        g += f'<circle cx="{P(ex + 0.5, -0.6)[0]:.2f}" cy="{P(ex + 0.5, -0.6)[1]:.2f}" r="{0.45 * s:.2f}" fill="#FFFFFF"/>'
    g += f'<path d="M{P(-1.3, 5)[0]:.2f} {P(-1.3, 5)[1]:.2f} L{P(1.3, 5)[0]:.2f} {P(1.3, 5)[1]:.2f} L{P(0, 6.4)[0]:.2f} {P(0, 6.4)[1]:.2f}Z" fill="#D98C8C"/>'
    g += pencil([P(0, 6.4), P(0, 7.6), P(-2, 8.6)], ink_c, w * 0.6, rnd)
    g += pencil([P(0, 7.6), P(2, 8.6)], ink_c, w * 0.6, rnd)
    for side in (-1, 1):
        for k in range(3):
            g += pencil([P(side * 9, 5 + k * 1.4), P(side * 16, 3.5 + k * 2.2), P(side * 23, 2.5 + k * 3.2)], ink_c, w * 0.4, rnd)
    # party hat, hatched, a little tilted
    hat = [P(-6, -16.5), P(7, -17.5), P(3, -38)]
    hd = smooth(hat)
    g += f'<defs><clipPath id="hat2{seed}"><path d="{hd}"/></clipPath></defs><g clip-path="url(#hat2{seed})">'
    for k in range(-20, 30):
        x0 = x + k * 0.8 * s
        g += f'<path d="M{x0:.2f} {y - 42 * s:.2f} L{x0 + 16 * s:.2f} {y - 14 * s:.2f}" stroke="{red}" stroke-width="{0.32 * s:.2f}" stroke-opacity="0.9"/>'
        g += f'<path d="M{x0:.2f} {y - 14 * s:.2f} L{x0 + 10 * s:.2f} {y - 42 * s:.2f}" stroke="{red}" stroke-width="{0.22 * s:.2f}" stroke-opacity="0.6"/>'
    g += "</g>"
    g += pencil(hat, red, w * 0.9, rnd, True, 0.06)
    g += pencil([P(-6, -16.5), P(-12, -6), P(-14, 4)], red, w * 0.6, rnd)
    g += "</g>"
    out.append(g)
    # red bow at the neck
    out.append(pencil([P(-9, 11), P(-3, 14.5), P(4, 14.5), P(9, 11)], red, w, rnd))
    out.append(pencil([P(0, 14.5), P(-5, 11.5), P(-6, 15.5), P(0, 14.5)], red, w * 0.9, rnd, True))
    out.append(pencil([P(0, 14.5), P(5, 11.5), P(6, 15.5), P(0, 14.5)], red, w * 0.9, rnd, True))
    out.append(pencil([P(0, 14.5), P(-2, 19), P(-3.5, 23)], red, w * 0.8, rnd))
    out.append(pencil([P(0, 14.5), P(2, 19), P(3, 23)], red, w * 0.8, rnd))
    return "".join(out)


def hand_on_edge(x, y, s, side, rnd, sleeve="#F1E6CF"):
    """A hand with a sleeve coming from behind the heart's edge (side -1 = left edge, +1 = right edge)."""
    ink_c = "#1A1A1A"
    k = side
    out = []
    sl = [(x + k * 1 * s, y - 4 * s), (x + k * 9 * s, y - 5 * s), (x + k * 10 * s, y + 4 * s), (x + k * 1 * s, y + 4.5 * s)]
    out.append(ink(sl, ink_c, 0.45 * s, True, rnd, 0.1, 1, sleeve))
    hand = [(x + k * 1 * s, y - 3.5 * s), (x - k * 4 * s, y - 4.5 * s), (x - k * 7.5 * s, y - 3 * s), (x - k * 8 * s, y + 0.5 * s),
            (x - k * 7 * s, y + 3.5 * s), (x - k * 3 * s, y + 4.5 * s), (x + k * 1 * s, y + 4 * s)]
    out.append(ink(hand, ink_c, 0.45 * s, True, rnd, 0.08, 1, "#F2B8A6"))
    for f in (-1.6, 0.2, 2.0):
        out.append(ink([(x - k * 4.5 * s, y + f * s), (x - k * 7.6 * s, y + f * s)], ink_c, 0.35 * s, False, rnd, 0.05, 1))
    return "".join(out)


def hug_heart(hx, hy, hs, seed=31):
    """A big crayon heart hugged by someone standing behind it: head peeking over the right lobe,
    hands round both edges, legs and shoes below. Returns (behind, heart_front_extras) svg parts."""
    rnd = random.Random(seed)
    ink_c = "#1A1A1A"
    behind, front = [], []
    # legs + shoes under the heart (behind it)
    for lx, d in ((hx - 9, -1), (hx + 7, 1)):
        leg = [(lx - 4, hy + 20), (lx + 4, hy + 20), (lx + 4 + d * 1.5, hy + hs + 18), (lx - 4 + d * 1.5, hy + hs + 18)]
        behind.append(ink(leg, ink_c, 0.45, True, rnd, 0.15, 1, "#22325E"))
        shoe = [(lx - 5 + d * 1.5, hy + hs + 17), (lx + 4 + d * 4, hy + hs + 17), (lx + 5 + d * 5, hy + hs + 21), (lx - 5 + d * 1.5, hy + hs + 21)]
        behind.append(ink(shoe, ink_c, 0.45, True, rnd, 0.1, 1, "#1A1A1A"))
    # head peeking over the right lobe (drawn behind, the heart covers the chin)
    cx, cy = hx + hs * 0.5, hy - hs * 0.78
    behind.append(ink(ellipse_pts(cx, cy, 6.5, 7.5, 28), ink_c, 0.45, True, rnd, 0.1, 1, "#F2B8A6"))
    for k in range(11):
        a = math.radians(190 + k * 16)
        behind.append(ink(ellipse_pts(cx + 6.6 * math.cos(a), cy - 1 + 7 * math.sin(a), 2.3, 2.0, 12), ink_c, 0.4, True, rnd, 0.05, 1, "#1A1A1A"))
    behind.append(f'<ellipse cx="{cx - 2.3:.2f}" cy="{cy - 0.3:.2f}" rx="0.7" ry="0.9" fill="{ink_c}"/>')
    behind.append(f'<ellipse cx="{cx + 2.3:.2f}" cy="{cy - 0.3:.2f}" rx="0.7" ry="0.9" fill="{ink_c}"/>')
    behind.append(f'<ellipse cx="{cx - 4:.2f}" cy="{cy + 2.2:.2f}" rx="1.4" ry="0.8" fill="#E8826E" fill-opacity="0.7"/>')
    behind.append(f'<ellipse cx="{cx + 4:.2f}" cy="{cy + 2.2:.2f}" rx="1.4" ry="0.8" fill="#E8826E" fill-opacity="0.7"/>')
    # hands round the edges (in front)
    front.append(hand_on_edge(hx - hs * 0.93, hy + hs * 0.02, 1.0, -1, rnd))
    front.append(hand_on_edge(hx + hs * 0.86, hy + hs * 0.28, 1.0, 1, rnd))
    return "".join(behind), "".join(front)


def side_hugger(hx, hy, hs, seed=41):
    """A little person standing at the heart's right side, cheek pressed to it, eyes happily shut, one arm round the
    front of the heart and one foot kicked up behind. Returns (body_svg, arm_svg): draw the body after the heart,
    the arm last."""
    rnd = random.Random(seed)
    K = "#1A1A1A"
    SKIN, SHIRT, PANTS = "#F4C1AE", "#3D6FD6", "#3A3A44"
    ex = hx + hs * 0.93            # heart's right edge near the top
    hx0, hy0 = ex + 6.5, hy - hs * 0.42  # head centre
    body = []
    # legs (behind torso): standing leg + kicked-up leg
    body.append(ink([(hx0 - 4, hy0 + 30), (hx0 + 1, hy0 + 30), (hx0 - 0.5, hy0 + 52), (hx0 - 5, hy0 + 52)], K, 0.45, True, rnd, 0.12, 1, PANTS))
    body.append(ink([(hx0 - 7.5, hy0 + 51), (hx0, hy0 + 51), (hx0 + 0.5, hy0 + 55), (hx0 - 8, hy0 + 55)], K, 0.45, True, rnd, 0.08, 1, K))
    body.append(ink([(hx0 + 1, hy0 + 29), (hx0 + 5, hy0 + 29), (hx0 + 12, hy0 + 40), (hx0 + 15, hy0 + 35), (hx0 + 18, hy0 + 37),
                     (hx0 + 13, hy0 + 45), (hx0 + 9, hy0 + 43), (hx0 + 3, hy0 + 35)], K, 0.45, True, rnd, 0.12, 1, PANTS))
    body.append(ink([(hx0 + 14.5, hy0 + 33.5), (hx0 + 19.5, hy0 + 31), (hx0 + 21, hy0 + 35), (hx0 + 17.5, hy0 + 37.5)], K, 0.45, True, rnd, 0.08, 1, K))
    # torso leaning into the heart
    torso = [(hx0 - 6, hy0 + 7), (hx0 + 5, hy0 + 6), (hx0 + 7, hy0 + 18), (hx0 + 6, hy0 + 31), (hx0 - 5, hy0 + 31), (hx0 - 7, hy0 + 18)]
    body.append(ink(torso, K, 0.45, True, rnd, 0.12, 1, SHIRT))
    for yy in (hy0 + 13, hy0 + 19, hy0 + 25):
        body.append(ink([(hx0 - 6.5, yy), (hx0 + 6.5, yy - 0.6)], "#A9C8F7", 0.6, False, rnd, 0.1, 1))
    # head tilted onto the heart
    g = f'<g transform="rotate(-16 {hx0:.2f} {hy0:.2f})">'
    g += ink(ellipse_pts(hx0, hy0, 6.8, 7.4, 30), K, 0.45, True, rnd, 0.08, 1, SKIN)
    for k in range(10):
        a = math.radians(195 + k * 17)
        g += ink(ellipse_pts(hx0 + 6.6 * math.cos(a), hy0 - 1.2 + 7.0 * math.sin(a), 2.2, 1.9, 12), K, 0.35, True, rnd, 0.04, 1, "#2A1E1A")
    for exx in (-2.6, 2.6):                     # happy closed eyes
        g += f'<path d="M{hx0 + exx - 1.3:.2f} {hy0 + 0.6:.2f} Q{hx0 + exx:.2f} {hy0 - 1.0:.2f} {hx0 + exx + 1.3:.2f} {hy0 + 0.6:.2f}" fill="none" stroke="{K}" stroke-width="0.5" stroke-linecap="round"/>'
    for bx in (-4.2, 4.2):
        g += f'<ellipse cx="{hx0 + bx:.2f}" cy="{hy0 + 2.6:.2f}" rx="1.5" ry="0.9" fill="#E8826E" fill-opacity="0.75"/>'
    g += f'<path d="M{hx0 - 1.4:.2f} {hy0 + 3.4:.2f} Q{hx0:.2f} {hy0 + 5.0:.2f} {hx0 + 1.4:.2f} {hy0 + 3.4:.2f}" fill="none" stroke="{K}" stroke-width="0.45" stroke-linecap="round"/>'
    g += "</g>"
    body.append(g)
    # near arm round the front of the heart, hand resting on it
    sh = (hx0 - 4, hy0 + 10)
    hand = (hx0 - 20, hy0 + 18)
    arm = [(sh[0] + 2, sh[1] - 2.5), (sh[0] - 7, sh[1] + 1), (hand[0] + 3, hand[1] - 3), (hand[0] + 3.5, hand[1] + 2.5),
           (sh[0] - 6, sh[1] + 6.5), (sh[0] + 2, sh[1] + 4)]
    arm_svg = ink(arm, K, 0.45, True, rnd, 0.1, 1, SHIRT)
    mitt = [(hand[0] + 3.5, hand[1] - 3.2), (hand[0] - 1, hand[1] - 4), (hand[0] - 4, hand[1] - 2), (hand[0] - 4.3, hand[1] + 1.3),
            (hand[0] - 2, hand[1] + 3.4), (hand[0] + 3.5, hand[1] + 2.8)]
    arm_svg += ink(mitt, K, 0.45, True, rnd, 0.06, 1, SKIN)
    for f in (-1.2, 0.6):
        arm_svg += ink([(hand[0] - 1.5, hand[1] + f), (hand[0] - 4.1, hand[1] + f + 0.2)], K, 0.3, False, rnd, 0.03, 1)
    return "".join(body), arm_svg


def cuddling_cats(cx, cy, s=1.0, color="#D3263A", seed=51):
    """Two kittens cheek to cheek, eyes shut, one hugging the other with a paw; red line art. (cx, cy) = between the heads."""
    rnd = random.Random(seed)
    out = []
    w = 0.5 * s

    def head(hx, hy, tilt, flip, eyes_closed=True):
        P = lambda a, b: (hx + a * s * flip, hy + b * s)
        g = f'<g transform="rotate({tilt} {hx:.2f} {hy:.2f})">'
        g += pencil([P(-14, 4), P(-15, -5), P(-12, -12), P(-13, -22), P(-5, -14), P(0, -15), P(6, -14), P(13, -22), P(12, -12),
                     P(15, -4), P(14, 5), P(8, 11), P(0, 12), P(-8, 11)], color, w, rnd, True, 0.1)
        g += f'<path d="M{P(-11.5, -13)[0]:.2f} {P(-11.5, -13)[1]:.2f} L{P(-12, -19.5)[0]:.2f} {P(-12, -19.5)[1]:.2f} L{P(-7.5, -14.5)[0]:.2f} {P(-7.5, -14.5)[1]:.2f}Z" fill="{color}" fill-opacity="0.85"/>'
        g += f'<path d="M{P(11.5, -13)[0]:.2f} {P(11.5, -13)[1]:.2f} L{P(12, -19.5)[0]:.2f} {P(12, -19.5)[1]:.2f} L{P(7.5, -14.5)[0]:.2f} {P(7.5, -14.5)[1]:.2f}Z" fill="{color}" fill-opacity="0.85"/>'
        for ex in (-5.5, 5.5):
            if eyes_closed:
                g += pencil([P(ex - 2.4, 0.5), P(ex, 1.8), P(ex + 2.4, 0.5)], color, w * 0.9, rnd, False, 0.04)
            else:
                g += f'<ellipse cx="{P(ex, 0.5)[0]:.2f}" cy="{P(ex, 0.5)[1]:.2f}" rx="{1.3 * s:.2f}" ry="{1.7 * s:.2f}" fill="{color}"/>'
        g += f'<path d="M{P(-1.2, 4.5)[0]:.2f} {P(-1.2, 4.5)[1]:.2f} L{P(1.2, 4.5)[0]:.2f} {P(1.2, 4.5)[1]:.2f} L{P(0, 5.8)[0]:.2f} {P(0, 5.8)[1]:.2f}Z" fill="{color}"/>'
        g += pencil([P(0, 5.8), P(-1.6, 7.6)], color, w * 0.7, rnd, False, 0.03)
        g += pencil([P(0, 5.8), P(1.6, 7.6)], color, w * 0.7, rnd, False, 0.03)
        for k in range(3):
            g += pencil([P(-8, 4.5 + k * 1.2), P(-19, 3 + k * 2.6)], color, w * 0.45, rnd, False, 0.08)
            g += pencil([P(8, 4.5 + k * 1.2), P(19, 3 + k * 2.6)], color, w * 0.45, rnd, False, 0.08)
        for k in range(4):                       # a few fur strokes on the forehead
            g += pencil([P(-3 + k * 2, -12), P(-2.6 + k * 2, -9)], color, w * 0.4, rnd, False, 0.05)
        g += "</g>"
        return g
    # bodies (simple soft shoulders) behind
    out.append(pencil([(cx - 32 * s, cy + 28 * s), (cx - 26 * s, cy + 12 * s), (cx - 16 * s, cy + 9 * s)], color, w, rnd))
    out.append(pencil([(cx + 32 * s, cy + 26 * s), (cx + 27 * s, cy + 12 * s), (cx + 17 * s, cy + 9 * s)], color, w, rnd))
    out.append(f'<g>{head(cx - 13.5 * s, cy, 8, 1)}</g>')
    out.append(f'<g>{head(cx + 13.5 * s, cy - 1 * s, -8, -1)}</g>')
    # left kitten's arm round the right one, paw on its shoulder
    arm = [(cx - 24 * s, cy + 20 * s), (cx - 8 * s, cy + 17 * s), (cx + 8 * s, cy + 15 * s), (cx + 20 * s, cy + 11 * s),
           (cx + 24 * s, cy + 14 * s), (cx + 22 * s, cy + 18 * s), (cx + 8 * s, cy + 21 * s), (cx - 10 * s, cy + 24 * s), (cx - 24 * s, cy + 27 * s)]
    out.append(f'<path d="{smooth(arm)}" fill="#FAD3DA"/>')
    out.append(pencil(arm, color, w, rnd, True, 0.08))
    for k in (-1, 0, 1):
        out.append(pencil([(cx + 22 * s, cy + (14 + k * 1.6) * s), (cx + 24.5 * s, cy + (14.3 + k * 1.6) * s)], color, w * 0.6, rnd, False, 0.02))
    for k in range(5):
        x0 = cx - 18 * s + k * 7 * s
        out.append(pencil([(x0, cy + 19.5 * s - k * 0.6 * s), (x0 + 3 * s, cy + 18.8 * s - k * 0.6 * s)], color, w * 0.4, rnd, False, 0.04))
    return "".join(out)


def goose(x, y, s=1.0):
    """A flat white goose: long neck rising from the bottom-left corner, head facing the viewer. (x, y) = head centre."""
    body_c, beak, beak_d, eye = "#E6E2DA", "#E8853A", "#C96B2B", "#1A1A1A"
    P = lambda a, b: (x + a * s, y + b * s)
    out = []
    neck = [P(-60, 120), P(-60, 55), P(-40, 40), P(-22, 28), P(-12, 14), P(-10, 0), P(-9, -10), P(-6, -16), P(0, -18), P(6, -16),
            P(9, -10), P(10, 0), P(12, 16), P(8, 36), P(-6, 64), P(-30, 120)]
    out.append(f'<path d="{smooth(neck)}" fill="{body_c}"/>')
    out.append(f'<path d="M{P(-6, -4)[0]:.2f} {P(-6, -4)[1]:.2f} L{P(-3, -9)[0]:.2f} {P(-3, -9)[1]:.2f} L{P(0, -6)[0]:.2f} {P(0, -6)[1]:.2f} '
               f'L{P(3, -9)[0]:.2f} {P(3, -9)[1]:.2f} L{P(6, -4)[0]:.2f} {P(6, -4)[1]:.2f} L{P(7, 9)[0]:.2f} {P(7, 9)[1]:.2f} '
               f'Q{P(0, 12)[0]:.2f} {P(0, 12)[1]:.2f} {P(-7, 9)[0]:.2f} {P(-7, 9)[1]:.2f}Z" fill="{beak}"/>')
    out.append(f'<path d="M{P(-6, 9)[0]:.2f} {P(-6, 9)[1]:.2f} Q{P(0, 13.5)[0]:.2f} {P(0, 13.5)[1]:.2f} {P(6, 9)[0]:.2f} {P(6, 9)[1]:.2f} '
               f'Q{P(0, 10.5)[0]:.2f} {P(0, 10.5)[1]:.2f} {P(-6, 9)[0]:.2f} {P(-6, 9)[1]:.2f}Z" fill="{beak_d}"/>')
    for ex in (-8.4, 8.4):
        out.append(f'<ellipse cx="{P(ex, -6)[0]:.2f}" cy="{P(ex, -6)[1]:.2f}" rx="{1.1 * s:.2f}" ry="{1.5 * s:.2f}" fill="{eye}"/>')
        out.append(f'<circle cx="{P(ex + 0.3, -6.6)[0]:.2f}" cy="{P(ex + 0.3, -6.6)[1]:.2f}" r="{0.35 * s:.2f}" fill="#FFFFFF"/>')
    for nx in (-1.4, 1.4):
        out.append(f'<circle cx="{P(nx, 1)[0]:.2f}" cy="{P(nx, 1)[1]:.2f}" r="{0.45 * s:.2f}" fill="#6B3A1A"/>')
    return "".join(out)


def outline_heart(cx, cy, s, color, w, rnd, amt=None):
    return ink(heart_pts(cx, cy, s, 60), color, w, True, rnd, s * 0.02 if amt is None else amt, 1)


def sun_burst(cx, cy, R, seed=61):
    """A hand-drawn sun: long pale rays, sharp peach rays with dotted hatching and a dark outline, glowing centre, sparkles."""
    rnd = random.Random(seed)
    out = []
    for i in range(16):
        a = math.radians(i * 22.5 + 11)
        L = R * rnd.uniform(1.05, 1.35)
        out.append(f'<path d="M{cx + R * 0.3 * math.cos(a):.2f} {cy + R * 0.3 * math.sin(a):.2f} L{cx + L * math.cos(a):.2f} {cy + L * math.sin(a):.2f}" '
                   f'stroke="#F7E3EE" stroke-width="0.9" stroke-linecap="round"/>')
    pts = []
    n = 14
    for i in range(2 * n):
        a = math.pi * i / n - math.pi / 2
        r = R * (rnd.uniform(0.85, 1.0) if i % 2 == 0 else 0.33)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "Z"
    out.append(f'<path d="{d}" fill="#F1A88E"/>')
    out.append(f'<defs><clipPath id="sun{seed}"><path d="{d}"/></clipPath></defs><g clip-path="url(#sun{seed})">')
    for _ in range(420):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(R * 0.3, R)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        out.append(f'<path d="M{x:.2f} {y:.2f} l{0.9 * math.cos(a):.2f} {0.9 * math.sin(a):.2f}" stroke="#D9542E" stroke-width="0.35" stroke-linecap="round"/>')
    out.append("</g>")
    out.append(f'<path d="{d}" fill="none" stroke="#1E2340" stroke-width="0.45" stroke-linejoin="miter"/>')
    out.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{R * 0.36:.2f}" fill="#E8DDF6"/>')
    out.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{R * 0.26:.2f}" fill="#F6F1FB"/>')
    for _ in range(10):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(R * 1.05, R * 1.5)
        x, y, k = cx + r * math.cos(a), cy + r * math.sin(a), rnd.uniform(1.2, 2.2)
        out.append(f'<path d="M{x - k:.2f} {y:.2f} L{x + k:.2f} {y:.2f} M{x:.2f} {y - k:.2f} L{x:.2f} {y + k:.2f} M{x - k * 0.6:.2f} {y - k * 0.6:.2f} '
                   f'L{x + k * 0.6:.2f} {y + k * 0.6:.2f} M{x - k * 0.6:.2f} {y + k * 0.6:.2f} L{x + k * 0.6:.2f} {y - k * 0.6:.2f}" '
                   f'stroke="#F8F1E4" stroke-width="0.3" stroke-linecap="round"/>')
    return "".join(out)


def stamp_path(x0, y0, x1, y1, r=1.6, gap=4.4):
    """A postage-stamp outline: rectangle with semicircle bites along every edge (perforation)."""
    def edge(ax, ay, bx, by):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, int(L / gap))
        ux, uy = (bx - ax) / L, (by - ay) / L
        nx, ny = uy, -ux                         # outward normal for a clockwise outline
        step = L / n
        d = ""
        for i in range(n):
            mx, my = ax + ux * step * (i + 0.5), ay + uy * step * (i + 0.5)
            p0 = (mx - ux * r, my - uy * r)
            p1 = (mx + ux * r, my + uy * r)
            d += f" L{p0[0]:.2f} {p0[1]:.2f} A{r} {r} 0 0 0 {p1[0]:.2f} {p1[1]:.2f}"
        return d + f" L{bx:.2f} {by:.2f}"
    return (f"M{x0:.2f} {y0:.2f}" + edge(x0, y0, x1, y0) + edge(x1, y0, x1, y1) + edge(x1, y1, x0, y1) + edge(x0, y1, x0, y0) + "Z")
