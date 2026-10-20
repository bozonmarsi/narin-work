"""Собирает HTML-страницы подарочных карт NARIN (85,6 x 54 мм + 2 мм вылеты).

    python3 print/gift-cards/build.py        # -> print/gift-cards/build/*.html, front-*.jpg
    node print/gift-cards/render.mjs         # -> print/gift-cards/out/*.pdf, preview/*.png

Данные карт: cards.csv (код, номинал, сцена лицевой стороны, ссылка для QR).
"""
import csv
import html
from pathlib import Path

import qrcode
from PIL import Image

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"

TRIM_W, TRIM_H, BLEED = 85.6, 54.0, 2.0
PAGE_W, PAGE_H = TRIM_W + 2 * BLEED, TRIM_H + 2 * BLEED
DPI = 300

BLUE = "#186ce0"  # фирменный синий (CMYK ~ 85/50/0/0)
INK = "#0f1b2d"
GREY = "#7b8494"

NOMINAL_LABEL = {500: "500", 1000: "1 000", 1500: "1 500", 2000: "2 000"}
STEPS = ["Naskenujte QR kód", "Přihlaste se nebo se zaregistrujte", "Částka je na vašem účtu"]
STRIP = "Platí 12 měsíců od aktivace · Lze uplatnit jen jednou"

FONT_FACES = "".join(
    f"""@font-face{{font-family:Rubik;font-weight:{w};src:url(../assets/fonts/rubik-latin-{w}-normal.woff2) format('woff2');
unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}}
@font-face{{font-family:Rubik;font-weight:{w};src:url(../assets/fonts/rubik-latin-ext-{w}-normal.woff2) format('woff2');
unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}}
"""
    for w in (400, 500, 700)
)

BASE_CSS = f"""
{FONT_FACES}
@page {{ size: {PAGE_W}mm {PAGE_H}mm; margin: 0 }}
* {{ box-sizing: border-box; margin: 0; padding: 0 }}
html, body {{ background: #fff }}
body {{ font-family: Rubik, sans-serif; color: {INK}; -webkit-print-color-adjust: exact; print-color-adjust: exact }}
.page {{ width: {PAGE_W}mm; height: {PAGE_H}mm; position: relative; overflow: hidden; page-break-after: always; background: #fff }}
.page:last-child {{ page-break-after: auto }}
.abs {{ position: absolute }}
/* направляющие только для превью: линия реза и безопасная зона */
.guides .trim {{ position: absolute; left: {BLEED}mm; top: {BLEED}mm; width: {TRIM_W}mm; height: {TRIM_H}mm;
  border: .15mm solid #e5007d; border-radius: 3mm; z-index: 9 }}
.guides .safe {{ position: absolute; left: {BLEED + 4}mm; top: {BLEED + 4}mm; width: {TRIM_W - 8}mm; height: {TRIM_H - 8}mm;
  border: .15mm dashed #00a0e0; z-index: 9 }}
"""


def mm(x: float) -> str:
    return f"{x:.2f}mm"


def qr_svg(data: str) -> str:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    qr.add_data(data)
    qr.make(fit=True)
    m = qr.get_matrix()
    n = len(m)
    d = "".join(f"M{x} {y}h1v1h-1z" for y, row in enumerate(m) for x, on in enumerate(row) if on)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges" '
            f'style="width:100%;height:100%;display:block"><path fill="#000" d="{d}"/></svg>')


def make_front_images(scenes: set[str]) -> None:
    """Обрезка сцены по центру под пропорцию карты с вылетами, без масштабирования вниз."""
    ratio = PAGE_W / PAGE_H
    for s in sorted(scenes):
        im = Image.open(ROOT / "assets" / "scenes" / f"{s}.webp").convert("RGB")
        w, h = im.size
        if w / h > ratio:
            nw = round(h * ratio)
            im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = round(w / ratio)
            im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        dpi = im.size[0] / (PAGE_W / 25.4)
        im.save(BUILD / f"front-{s}.jpg", quality=95, subsampling=0, dpi=(dpi, dpi))
        print(f"{s}: {im.size[0]}x{im.size[1]} px -> {dpi:.0f} dpi на карте")


def front_page(scene: str, guides: bool) -> str:
    g = '<div class="guides"><div class="trim"></div><div class="safe"></div></div>' if guides else ""
    return (f'<div class="page"><img class="abs" src="front-{scene}.jpg" '
            f'style="left:0;top:0;width:{PAGE_W}mm;height:{PAGE_H}mm;object-fit:cover">{g}</div>')


def back_page(nominal: int, code: str | None, url: str | None, guides: bool) -> str:
    x0 = y0 = BLEED + 4  # левый верхний угол безопасной зоны
    right = BLEED + TRIM_W - 4
    qr_size = 24.0
    qr_x = right - qr_size
    qr_y = y0 + 0.5
    strip_top = BLEED + 46.0

    steps = "".join(
        f'<div style="display:flex;align-items:center;gap:1.4mm;height:3.6mm">'
        f'<span style="flex:none;width:3.2mm;height:3.2mm;border-radius:50%;background:{BLUE};color:#fff;'
        f'font-size:5.2pt;font-weight:500;display:flex;align-items:center;justify-content:center;line-height:1">{i}</span>'
        f'<span style="font-size:6.2pt;line-height:1;color:{INK}">{html.escape(t)}</span></div>'
        for i, t in enumerate(STEPS, 1)
    )

    if code:
        qr_inner = f'<div class="abs" style="left:2mm;top:2mm;width:{mm(qr_size - 4)};height:{mm(qr_size - 4)}">{qr_svg(url)}</div>'
        code_text = html.escape(code)
    else:  # шаблон для типографии с собственной персонализацией: пустые места
        qr_inner = (f'<div class="abs" style="left:2mm;top:2mm;width:{mm(qr_size - 4)};height:{mm(qr_size - 4)};'
                    f'border:.2mm dashed #c3cad6;display:flex;align-items:center;justify-content:center;'
                    f'font-size:5pt;color:#9aa3b2">QR</div>')
        code_text = "NR-XXXX-XXXX"

    g = '<div class="guides"><div class="trim"></div><div class="safe"></div></div>' if guides else ""
    return f"""<div class="page">
  <img class="abs" src="../assets/narin-logo.png" style="left:{mm(x0)};top:{mm(y0)};width:24mm">
  <div class="abs" style="left:{mm(x0)};top:{mm(y0 + 8.6)};font-size:6pt;line-height:1;color:{GREY};letter-spacing:.06em">gift card</div>
  <div class="abs" style="left:{mm(x0 - 0.4)};top:{mm(y0 + 11.4)};font-weight:700;line-height:1;color:{BLUE};white-space:nowrap">
    <span style="font-size:25pt;letter-spacing:-.01em">{NOMINAL_LABEL[nominal]}</span><span style="font-size:15pt">&nbsp;Kč</span>
  </div>
  <div class="abs" style="left:{mm(x0)};top:{mm(y0 + 23.2)};display:flex;flex-direction:column;gap:.55mm">{steps}</div>

  <div class="abs" style="left:{mm(qr_x)};top:{mm(qr_y)};width:{mm(qr_size)};height:{mm(qr_size)};background:#fff;
       border:.2mm solid #d5e3f9;border-radius:1.6mm">{qr_inner}</div>
  <div class="abs" style="left:{mm(qr_x - 3)};width:{mm(qr_size + 6)};top:{mm(qr_y + qr_size + 2.1)};text-align:center;
       font-size:7.2pt;font-weight:500;line-height:1;letter-spacing:.05em;color:{INK};white-space:nowrap">{code_text}</div>
  <div class="abs" style="left:{mm(qr_x - 3)};width:{mm(qr_size + 6)};top:{mm(qr_y + qr_size + 5.6)};text-align:center;
       font-size:5.8pt;line-height:1;color:{BLUE};white-space:nowrap">vezminarin.cz/poukaz</div>

  <div class="abs" style="left:0;top:{mm(strip_top)};width:{PAGE_W}mm;height:{mm(PAGE_H - strip_top)};background:{BLUE}"></div>
  <div class="abs" style="left:{mm(x0)};width:{mm(right - x0)};top:{mm(strip_top)};height:5.4mm;
       display:flex;align-items:center;justify-content:center;color:#fff;font-size:5.9pt;font-weight:500;white-space:nowrap">{html.escape(STRIP)}</div>
  {g}
</div>"""


def write(name: str, pages: list[str]) -> None:
    (BUILD / f"{name}.html").write_text(
        f'<!doctype html><html lang="cs"><head><meta charset="utf-8"><style>{BASE_CSS}</style></head>'
        f'<body>{"".join(pages)}</body></html>', encoding="utf-8")


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    cards = list(csv.DictReader(open(ROOT / "cards.csv", encoding="utf-8")))
    for c in cards:
        c["nominal_czk"] = int(c["nominal_czk"])
    nominals = sorted({c["nominal_czk"] for c in cards})
    scene_of = {c["nominal_czk"]: c["front"] for c in cards}

    make_front_images(set(scene_of.values()))

    # Лицевые стороны: по одной на номинал (без текста, одинаковые для всех карт номинала).
    write("fronts", [front_page(scene_of[n], False) for n in nominals])
    # Обороты с персонализацией: 20 страниц, порядок = cards.csv.
    write("backs", [back_page(c["nominal_czk"], c["code"], c["qr_url"], False) for c in cards])
    # Шаблоны оборота без QR/кода — если типография персонализирует сама.
    write("back-templates", [back_page(n, None, None, False) for n in nominals])
    # Дуплекс: лицо, оборот, лицо, оборот… — 40 страниц.
    write("duplex", [p for c in cards for p in (front_page(c["front"], False),
                                                    back_page(c["nominal_czk"], c["code"], c["qr_url"], False))])
    # Превью с линией реза и безопасной зоной — только для согласования.
    write("preview", [p for n in nominals for p in (
        front_page(scene_of[n], True),
        back_page(n, "NR-XXXX-XXXX", "https://vezminarin.cz/poukaz", True))])  # без реальных кодов: репо публичный
    print(f"{len(cards)} карт, номиналы: " + ", ".join(
        f"{n} Kč x{sum(c['nominal_czk'] == n for c in cards)}" for n in nominals))


if __name__ == "__main__":
    main()
