"""Собирает HTML-страницы подарочных карт NARIN (85,6 x 54 мм + 2 мм вылеты).

    python3 print/gift-cards/build.py        # -> print/gift-cards/build/*.html, front-*.jpg
    node print/gift-cards/render.mjs         # -> print/gift-cards/out/*.pdf, preview/*.png

Данные карт: cards.csv (код, номинал, сцена лицевой стороны, ссылка для QR).
"""
import csv
import html
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"

TRIM_W, TRIM_H, BLEED = 85.6, 54.0, 2.0
PAGE_W, PAGE_H = TRIM_W + 2 * BLEED, TRIM_H + 2 * BLEED
DPI = 300

BLUE = "#186ce0"  # фирменный синий (CMYK ~ 85/50/0/0)
INK = "#0f1b2d"
GREY = "#7b8494"

NOMINAL_LABEL = {500: "500", 1000: "1 000", 1500: "1 500", 2000: "2 000"}

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


# Оборот (вариант B): та же картина, что на лице, приглушённая синим; слева белая карточка, справа QR.
BOX = (BLEED + 4, BLEED + 4, BLEED + 52, BLEED + 47.2)  # белая карточка: x1, y1, x2, y2 в мм страницы
COL_X = BOX[2]  # правая колонка с QR: от карточки до края


def make_back_images(scenes: set[str]) -> None:
    """Фон оборота растром: картина + синяя заливка + белая карточка, без прозрачности в PDF."""
    for s in sorted(scenes):
        im = Image.open(BUILD / f"front-{s}.jpg").convert("RGB")
        w, h = im.size
        k = w / PAGE_W  # px на мм
        # синий градиент по диагонали: плотнее слева сверху
        grad = Image.linear_gradient("L").rotate(45, expand=True).resize((w, h))
        alpha = grad.point(lambda v: int(255 * (0.72 - 0.14 * v / 255)))
        im = Image.composite(Image.new("RGB", (w, h), (16, 74, 170)), im, alpha)
        # затемнение снизу, чтобы белая шкала читалась
        bottom = Image.linear_gradient("L").resize((w, h)).point(lambda v: int(max(0, v - 150) * 0.9))
        im = Image.composite(Image.new("RGB", (w, h), (8, 36, 96)), im, bottom)
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([round(c * k) for c in BOX], radius=round(2.6 * k), fill=(255, 255, 255))
        im.save(BUILD / f"back-{s}.jpg", quality=95, subsampling=0)


def ruler() -> str:
    """Шкала 0–8 см по нижнему краю, белая поверх картины. Ноль = левый край карты, риски уходят в вылет.
    Цифры на 4 мм от края (безопасная зона)."""
    edge = BLEED + TRIM_H
    out = []
    for i in range(int(TRIM_W) + 1):
        x = BLEED + i
        hgt = 2.0 if i % 10 == 0 else 1.3 if i % 5 == 0 else 0.8
        out.append(f'<line x1="{x}" y1="{PAGE_H}" x2="{x}" y2="{edge - hgt}" stroke="#fff" stroke-width=".13"/>')
        if i % 10 == 0 and 0 < i < 85:
            out.append(f'<text x="{x}" y="{edge - 4}" font-size="1.45" text-anchor="middle" fill="#fff" '
                       f'font-family="Rubik" font-weight="500">{i // 10}</text>')
    out.append(f'<text x="{BLEED + 4}" y="{edge - 4}" font-size="1.3" fill="#fff" font-family="Rubik">cm</text>')
    return (f'<svg class="abs" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PAGE_W} {PAGE_H}" '
            f'style="left:0;top:0;width:{PAGE_W}mm;height:{PAGE_H}mm">{"".join(out)}</svg>')


def back_page(nominal: int, scene: str, code: str | None, url: str | None, guides: bool) -> str:
    bx, by = BOX[0] + 4, BOX[1] + 4  # отступ текста внутри карточки
    qr_size = 21.0
    col_w = BLEED + TRIM_W - COL_X  # видимая ширина колонки
    qr_x = COL_X + (col_w - qr_size) / 2
    qr_y = BLEED + 6

    if code:
        qr_inner = f'<div class="abs" style="left:1.6mm;top:1.6mm;width:{mm(qr_size - 3.2)};height:{mm(qr_size - 3.2)}">{qr_svg(url)}</div>'
        code_text = html.escape(code)
    else:  # шаблон для типографии с собственной персонализацией: пустые места
        qr_inner = (f'<div class="abs" style="left:1.6mm;top:1.6mm;width:{mm(qr_size - 3.2)};height:{mm(qr_size - 3.2)};'
                    f'border:.2mm dashed #c3cad6;display:flex;align-items:center;justify-content:center;'
                    f'font-size:5pt;color:#9aa3b2">QR</div>')
        code_text = "NR-XXXX-XXXX"

    g = '<div class="guides"><div class="trim"></div><div class="safe"></div></div>' if guides else ""
    return f"""<div class="page">
  <img class="abs" src="back-{scene}.jpg" style="left:0;top:0;width:{PAGE_W}mm;height:{PAGE_H}mm">
  <img class="abs" src="../assets/narin-logo.png" style="left:{mm(bx)};top:{mm(by)};width:20mm">
  <div class="abs" style="left:{mm(bx - 0.2)};top:{mm(by + 8.6)};font-size:17pt;font-weight:500;color:{BLUE};line-height:1;letter-spacing:-.01em">gift card</div>
  <div class="abs" style="left:{mm(bx - 0.4)};top:{mm(by + 16.4)};font-weight:700;line-height:1;color:{INK};white-space:nowrap">
    <span style="font-size:25pt;letter-spacing:-.025em">{NOMINAL_LABEL[nominal]}</span><span style="font-size:12.5pt;color:{BLUE};margin-left:1.2mm">Kč</span>
  </div>
  <div class="abs" style="left:{mm(bx)};top:{mm(by + 29.6)};font-size:7.4pt;font-weight:500;color:{BLUE};line-height:1">vezminarin.cz</div>
  <div class="abs" style="left:{mm(bx)};top:{mm(by + 33.2)};font-size:5pt;color:{GREY};line-height:1;white-space:nowrap">Instagram &amp; Threads: <span style="color:{INK};font-weight:500">@narin.cz</span></div>

  <div class="abs" style="left:{mm(qr_x)};top:{mm(qr_y)};width:{mm(qr_size)};height:{mm(qr_size)};background:#fff;border-radius:1.8mm">{qr_inner}</div>
  <div class="abs" style="left:{mm(COL_X)};width:{mm(col_w)};top:{mm(qr_y + qr_size + 2.2)};text-align:center;
       font-size:6.6pt;font-weight:500;line-height:1;letter-spacing:.06em;color:#fff;white-space:nowrap">{code_text}</div>
  <div class="abs" style="left:{mm(COL_X)};width:{mm(col_w)};top:{mm(qr_y + qr_size + 5.4)};text-align:center;
       font-size:5.3pt;line-height:1;color:#fff;white-space:nowrap">vezminarin.cz/poukaz</div>
  <div class="abs" style="left:{mm(COL_X)};width:{mm(col_w)};top:{mm(BLEED + 37.6)};text-align:center;
       font-size:4.6pt;line-height:1.5;color:#fff;font-weight:500">Platí 12 měsíců od aktivace<br>Lze uplatnit jen jednou</div>
  {ruler()}
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
    make_back_images(set(scene_of.values()))

    # Лицевые стороны: по одной на номинал (без текста, одинаковые для всех карт номинала).
    write("fronts", [front_page(scene_of[n], False) for n in nominals])
    # Обороты с персонализацией: 20 страниц, порядок = cards.csv.
    write("backs", [back_page(c["nominal_czk"], c["front"], c["code"], c["qr_url"], False) for c in cards])
    # Шаблоны оборота без QR/кода — если типография персонализирует сама.
    write("back-templates", [back_page(n, scene_of[n], None, None, False) for n in nominals])
    # Дуплекс: лицо, оборот, лицо, оборот… — 40 страниц.
    write("duplex", [p for c in cards for p in (front_page(c["front"], False),
                                                    back_page(c["nominal_czk"], c["front"], c["code"], c["qr_url"], False))])
    # Превью с линией реза и безопасной зоной — только для согласования.
    write("preview", [p for n in nominals for p in (
        front_page(scene_of[n], True),
        back_page(n, scene_of[n], "NR-XXXX-XXXX", "https://vezminarin.cz/poukaz", True))])  # без реальных кодов: репо публичный
    print(f"{len(cards)} карт, номиналы: " + ", ".join(
        f"{n} Kč x{sum(c['nominal_czk'] == n for c in cards)}" for n in nominals))


if __name__ == "__main__":
    main()
