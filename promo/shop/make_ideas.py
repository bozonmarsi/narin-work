"""Two simpler window ideas without printing (everything plotter-cut vinyl), for comparison:
1  white line-art bouquets in the bottom corners (boutique look), colour tulips only in the A;
2  flat brand daisies of coloured vinyl growing from the bottom corners.
No keyline on top. Writes ideas/idea-1-*.svg and ideas/idea-2-*.svg (mockup on the glass)."""
import math
import pathlib
import re
import xml.etree.ElementTree as ET

HERE = pathlib.Path(__file__).parent
SRC = HERE / "out" / "arch-decal-P-garden-line.svg"
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
ET.register_namespace("inkscape", "http://www.inkscape.org/namespaces/inkscape")
AW, AH = 1440, 700
ARCH = f"M0 {AH} A{AW / 2} {AH} 0 0 1 {AW} {AH} Z"
DAISY = (HERE / "daisy_path.txt").read_text().strip()
HOLE = "M8.5 0A8.5 8.5 0 1 0 -8.5 0A8.5 8.5 0 1 0 8.5 0Z"
BLUE, RED, YELLOW, GREEN, PURPLE, LILAC, COBALT = "#0B4DB5", "#FF3B2F", "#FFD84A", "#2A9A4B", "#8B55F6", "#F3CDF6", "#1C70E3"
LEAF2 = "#19C98A"
W = "#FFFFFF"


def clean(el):
    s = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", ET.tostring(el, encoding="unicode"))
    return re.sub(r'\sinkscape:\w+="[^"]*"', "", s)


def base():
    L = {g.get("id"): g for g in ET.parse(SRC).getroot() if g.tag == f"{{{NS}}}g"}
    return clean(L["logo"]) + clean(L["text"])


def doc(body, title):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{AW}mm" height="{AH}mm" '
            f'viewBox="0 0 {AW} {AH}"><title>{title}</title>{body}</svg>\n')


def mirror(g):
    return f'<g transform="translate({AW} 0) scale(-1 1)">{g}</g>'


# ---------------- idea 1: white line art ----------------
SW = 4.5   # line width in mm: thick enough to weed and to read from the street


def line(d, w=SW):
    return f'<path d="{d}" fill="none" stroke="{W}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'


def q_point(p0, c, p1, t):
    return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1])


def la_leaf(x, y, L, ang):
    w = L * 0.34
    t = f'translate({x:.1f} {y:.1f}) rotate({ang:.1f})'
    return (f'<g transform="{t}">' + line(f"M0 0 C{L * .25:.1f} {-w:.1f} {L * .8:.1f} {-w:.1f} {L:.1f} 0 C{L * .8:.1f} {w:.1f} {L * .25:.1f} {w:.1f} 0 0Z")
            + line(f"M{L * .1:.1f} 0 Q{L * .5:.1f} {-w * .15:.1f} {L * .78:.1f} 0", SW * .7) + "</g>")


def la_tulip(x, y, s, ang):
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({ang:.1f}) scale({s:.3f})">'
            + line("M-20 -4 C-28 -26 -24 -50 -14 -66 C-10 -56 -6 -50 0 -48 C6 -50 10 -56 14 -66 C24 -50 28 -26 20 -4 C12 6 -12 6 -20 -4Z", SW / s)
            + line("M0 -48 C-7 -32 -7 -14 0 2", SW * .7 / s) + "</g>")


def la_daisy(x, y, r, n=9, rot=0):
    out = [f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r * .22:.1f}" fill="none" stroke="{W}" stroke-width="{SW}"/>']
    for i in range(n):
        a = math.radians(rot + 360 * i / n)
        c, s_ = math.cos(a), math.sin(a)
        p = lambda u, v: (x + u * c - v * s_, y + u * s_ + v * c)
        a0, b0, tip, b1, a1 = p(r * .3, -r * .07), p(r * .95, -r * .2), p(r * 1.05, 0), p(r * .95, r * .2), p(r * .3, r * .07)
        out.append(line(f"M{a0[0]:.1f} {a0[1]:.1f} C{b0[0]:.1f} {b0[1]:.1f} {tip[0]:.1f} {tip[1] - 0:.1f} {tip[0]:.1f} {tip[1]:.1f} "
                        f"C{tip[0]:.1f} {tip[1]:.1f} {b1[0]:.1f} {b1[1]:.1f} {a1[0]:.1f} {a1[1]:.1f}", SW * .85))
    return "".join(out)


def la_berries(x, y, ang, n=4):
    out = []
    for i in range(n):
        a = math.radians(ang - 40 + 80 * i / max(1, n - 1))
        bx, by = x + 26 * math.cos(a), y + 26 * math.sin(a)
        out.append(line(f"M{x:.1f} {y:.1f} L{bx:.1f} {by:.1f}", SW * .7))
        out.append(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="6" fill="{W}"/>')
    return "".join(out)


def bouquet_1(variant=0):
    """A loose spray from the bottom corner leaning into the window: tulip, daisy, leaves, berries."""
    out = []
    g0 = (70, AH + 4)
    stems = [((150, 560), (250, 488), "tulip"), ((110, 560), (110, 470), "daisy"), ((220, 640), (330, 560), "berries"),
             ((190, 600), (305, 610), "leafy"), ((90, 600), (60, 540), "bud")] if variant == 0 else \
            [((140, 560), (215, 478), "daisy"), ((100, 570), (95, 500), "tulip"), ((230, 630), (335, 575), "leafy"),
             ((200, 600), (285, 520), "berries"), ((80, 610), (55, 560), "bud")]
    for c, end, kind in stems:
        out.append(line(f"M{g0[0]} {g0[1]} Q{c[0]} {c[1]} {end[0]} {end[1]}"))
        for t, side in ((.35, 1), (.6, -1)):
            px, py = q_point(g0, c, end, t)
            dx, dy = q_point(g0, c, end, t + .02)
            ang = math.degrees(math.atan2(dy - py, dx - px)) + side * 50
            if kind != "bud" or t < .5:
                out.append(la_leaf(px, py, 46 if kind != "leafy" else 58, ang))
        ex, ey = end
        dx, dy = q_point(g0, c, end, .97)
        ang = math.degrees(math.atan2(ey - dy, ex - dx))
        if kind == "tulip":
            out.append(la_tulip(ex, ey, 1.05, ang + 90))
        elif kind == "daisy":
            out.append(la_daisy(ex + 30 * math.cos(math.radians(ang)), ey + 30 * math.sin(math.radians(ang)), 34, 9, 10))
        elif kind == "berries":
            out.append(la_berries(ex, ey, ang))
        elif kind == "leafy":
            out.append(la_leaf(ex, ey, 52, ang))
        else:
            out.append(f'<ellipse cx="{ex:.1f}" cy="{ey - 8:.1f}" rx="9" ry="13" fill="none" stroke="{W}" stroke-width="{SW}"/>')
    return "".join(out)


# ---------------- idea 2: flat brand daisies of coloured vinyl ----------------
def daisy(x, y, d, color, rot=0.0):
    s = d / 100
    return (f'<path transform="translate({x:.1f} {y:.1f}) rotate({rot:.1f}) scale({s:.4f})" fill="{color}" '
            f'fill-rule="evenodd" d="{DAISY} {HOLE}"/>')


def leaf(x, y, L, ang, col):
    w = L * .36
    return (f'<path transform="translate({x:.1f} {y:.1f}) rotate({ang:.1f})" fill="{col}" '
            f'd="M0 0 C{L * .25:.1f} {-w:.1f} {L * .8:.1f} {-w:.1f} {L:.1f} 0 C{L * .8:.1f} {w:.1f} {L * .25:.1f} {w:.1f} 0 0Z"/>')


def cluster_2(cols):
    """Brand daisies on long stems, largest at the back, from the bottom corner."""
    spec = [((62, AH + 4), (95, 590), (140, 548), 118, 12), ((40, AH + 4), (40, 610), (60, 600), 84, 40),
            ((110, AH + 4), (190, 640), (262, 600), 92, 25), ((175, AH + 4), (240, 680), (330, 662), 64, 5)]
    stems, leaves, heads = [], [], []
    for (g, c, e, d, rot), col in zip(spec, cols):
        stems.append(f'<path d="M{g[0]} {g[1]} Q{c[0]} {c[1]} {e[0]} {e[1]}" fill="none" stroke="{GREEN}" stroke-width="9" stroke-linecap="round"/>')
        px, py = q_point(g, c, e, .45)
        dx, dy = q_point(g, c, e, .47)
        a = math.degrees(math.atan2(dy - py, dx - px))
        leaves.append(leaf(px, py, d * .55, a + 48, LEAF2))
        if d > 80:
            px, py = q_point(g, c, e, .7)
            leaves.append(leaf(px, py, d * .45, a - 52, GREEN))
        heads.append(daisy(e[0], e[1], d, col, rot))
    return "".join(stems + leaves + heads)


def main():
    out = HERE / "ideas"
    out.mkdir(exist_ok=True)
    glass = f'<path d="{ARCH}" fill="#2E3A52"/>'
    letters = f'<g transform="translate(0 -40)">{base()}</g>'   # no garden band: lettering sits 40 mm higher
    sc = lambda g, k: f'<g transform="translate(70 {AH + 4}) scale({k}) translate(-70 {-AH - 4})">{g}</g>'
    one = sc(bouquet_1(0), .8) + mirror(sc(bouquet_1(1), .8))
    (out / "idea-1-bila-linka.svg").write_text(doc(glass + letters + one, "Idea 1: white line-art bouquets"), encoding="utf-8")
    two = cluster_2([COBALT, RED, YELLOW, PURPLE]) + mirror(cluster_2([YELLOW, LILAC, RED, COBALT]))
    (out / "idea-2-barevne-kopretiny.svg").write_text(doc(glass + letters + two, "Idea 2: brand daisies of coloured vinyl"), encoding="utf-8")


if __name__ == "__main__":
    main()
