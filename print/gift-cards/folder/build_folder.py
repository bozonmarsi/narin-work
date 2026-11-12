"""Раскладка-обложка для подарочной карты NARIN: печать дома на A4, одна сторона.

Лист складывается по горизонтали картинкой наружу (двойной плотный лист), потом пополам как книжка.
Карта держится уголками в двух косых прорезях на правой внутренней панели.

    python3 print/gift-cards/folder/build_folder.py   # -> folder/build/*.html, logo-*.png
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
BUILD = HERE / "build"

BLUE = "#186ce0"
INK = "#0f1b2d"
GREY = "#7b8494"

PW, PH = 297.0, 210.0  # A4 альбомная
W, H = 125.0, 95.0  # одна панель готовой обложки
X0, Y0 = (PW - 2 * W) / 2, (PH - 2 * H) / 2  # левый верхний угол раскладки
FOLD_Y = Y0 + H  # горизонтальный сгиб (верхний край готовой обложки)
SPINE_X = X0 + W  # вертикальный сгиб (корешок)
BLEED = 3.0

CARD_W, CARD_H = 85.6, 54.0
SLIT_D = 9.0  # на сколько мм от угла карты прорезь пересекает её края

FONTS = "".join(
    f"@font-face{{font-family:Rubik;font-weight:{w};src:url(../../assets/fonts/rubik-latin-{w}-normal.woff2)}}"
    f"@font-face{{font-family:Rubik;font-weight:{w};src:url(../../assets/fonts/rubik-latin-ext-{w}-normal.woff2);"
    f"unicode-range:U+0100-02BA,U+1E00-1EFF}}"
    for w in (400, 500, 700)
)


def make_logos() -> None:
    """Белый логотип (тюльпан в цвете) и однотонный для крупного водяного знака."""
    im = Image.open(ASSETS / "narin-logo.png").convert("RGBA")
    white, mark = im.copy(), im.copy()
    wp, mp = white.load(), mark.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = wp[x, y]
            if a and b > r + 60 and b > g + 30:  # синие буквы
                wp[x, y] = (255, 255, 255, a)
            mp[x, y] = (61, 134, 238, a)  # чуть светлее фирменного синего
    white.save(BUILD / "logo-white.png")
    mark.save(BUILD / "logo-mark.png")


def mm(v: float) -> str:
    return f"{v:.2f}mm"


def outside_spread() -> str:
    """Внешняя сторона в своих координатах (0..2W, 0..H), сгиб сверху. На листе повёрнута на 180°."""
    return f"""
  <div class="abs" style="left:-{BLEED}mm;top:-2mm;width:{mm(2 * W + 2 * BLEED)};height:{mm(H + 2 + BLEED)};background:{BLUE}"></div>
  <!-- задняя обложка (слева) -->
  <div class="abs" style="left:0;top:{mm(H - 17)};width:{mm(W)};text-align:center;color:#fff">
    <div style="font-size:9pt;font-weight:500">vezminarin.cz</div>
    <div style="font-size:7pt;opacity:.85;margin-top:1mm">Instagram &amp; Threads: @narin.cz</div>
  </div>
  <!-- лицевая обложка (справа): логотип, фраза, крупный обрезанный водяной знак -->
  <div class="abs" style="left:{mm(W)};top:-2mm;width:{mm(W + BLEED)};height:{mm(H + 2 + BLEED)};overflow:hidden">
    <img class="abs" src="logo-mark.png" style="left:6mm;top:{mm(2 + H - 30)};width:170mm">
  </div>
  <img class="abs" src="logo-white.png" style="left:{mm(W + (W - 46) / 2)};top:18mm;width:46mm">
  <div class="abs" style="left:{mm(W)};top:35mm;width:{mm(W)};text-align:center;color:#fff;font-size:11pt;letter-spacing:.02em">Dárek, který rozkvete</div>
"""


def inside_spread() -> str:
    """Внутренняя сторона (0..2W, 0..H), сгиб сверху."""
    cx, cy = W + (W - CARD_W) / 2, (H - CARD_H) / 2
    d, e = SLIT_D, 1.2  # e — прорезь выходит за края карты, чтобы уголок свободно заходил
    slits = [
        (cx - e, cy + d + e, cx + d + e, cy - e),  # левый верхний угол
        (cx + CARD_W - d - e, cy + CARD_H + e, cx + CARD_W + e, cy + CARD_H - d - e),  # правый нижний
    ]
    lines = "".join(
        f'<line x1="{a}" y1="{b}" x2="{c}" y2="{f}" stroke="#7f93b3" stroke-width=".25"/>' for a, b, c, f in slits
    )
    write_line = lambda y, label: (  # noqa: E731
        f'<div class="abs" style="left:14mm;top:{mm(y)};width:{mm(W - 28)};display:flex;align-items:flex-end;gap:2mm">'
        f'<span style="font-size:8pt;color:{GREY};line-height:1">{label}</span>'
        f'<span style="flex:1;border-bottom:.25mm solid #b9c7de"></span></div>')
    step = lambda n, t: (  # noqa: E731
        f'<div style="display:flex;gap:1.6mm;align-items:center;margin-top:1.3mm">'
        f'<span style="flex:none;width:3.6mm;height:3.6mm;border-radius:50%;background:{BLUE};color:#fff;font-size:5.6pt;'
        f'font-weight:500;display:flex;align-items:center;justify-content:center">{n}</span>'
        f'<span style="font-size:6.8pt;color:{INK}">{t}</span></div>')
    return f"""
  <!-- левая панель: кому / от кого / как уплатнить -->
  <div class="abs" style="left:14mm;top:13mm;font-size:20pt;font-weight:500;color:{BLUE};line-height:1">Dárková karta</div>
  {write_line(31, "Pro")}
  {write_line(42, "Od")}
  <div class="abs" style="left:14mm;top:56mm;font-size:6.4pt;font-weight:500;letter-spacing:.14em;color:{BLUE}">JAK UPLATNIT</div>
  <div class="abs" style="left:14mm;top:59mm">
    {step(1, "Naskenujte QR kód na zadní straně karty")}
    {step(2, "Přihlaste se nebo se zaregistrujte")}
    {step(3, "Částka se připíše na váš účet")}
  </div>
  <div class="abs" style="left:14mm;top:{mm(H - 11)};font-size:6.4pt;color:{GREY}">Platí 12 měsíců od aktivace · vezminarin.cz/poukaz</div>
  <!-- правая панель: место карты (бледный контур) и две прорези -->
  <div class="abs" style="left:{mm(cx)};top:{mm(cy)};width:{mm(CARD_W)};height:{mm(CARD_H)};border:.2mm dashed #d3def0;border-radius:3mm"></div>
  <svg class="abs" viewBox="0 0 {2 * W} {H}" style="left:0;top:0;width:{mm(2 * W)};height:{mm(H)}">{lines}</svg>
  <div class="abs" style="left:{mm(W)};top:{mm(cy + CARD_H + 6)};width:{mm(W)};text-align:center;font-size:6.6pt;color:{GREY}">S láskou, NARIN</div>
"""


def marks() -> str:
    """Метки реза (уголки) и сгибов (пунктир) за пределами раскладки."""
    x1, y1, x2, y2 = X0, Y0, X0 + 2 * W, Y0 + 2 * H
    off, ln = 5.0, 5.0
    seg = []
    for x, y, sx, sy in ((x1, y1, -1, -1), (x2, y1, 1, -1), (x1, y2, -1, 1), (x2, y2, 1, 1)):
        seg.append((x + sx * off, y, x + sx * (off + ln), y, False))
        seg.append((x, y + sy * off, x, y + sy * (off + ln), False))
    for y in (y1 - off, y2 + off):  # вертикальный сгиб
        seg.append((SPINE_X, y, SPINE_X, y + (-ln if y < y1 else ln), True))
    for x in (x1 - off, x2 + off):  # горизонтальный сгиб
        seg.append((x, FOLD_Y, x + (-ln if x < x1 else ln), FOLD_Y, True))
    dash_attr = ' stroke-dasharray="1 .8"'
    svg = "".join(
        f'<line x1="{a}" y1="{b}" x2="{c}" y2="{d}" stroke="#000" stroke-width=".2"{dash_attr if dash else ""}/>'
        for a, b, c, d, dash in seg)
    labels = (
        f'<div class="abs" style="left:{mm(SPINE_X + 1.5)};top:{mm(y1 - 9)};font-size:5pt;color:#666">сгиб</div>'
        f'<div class="abs" style="left:{mm(x2 + 5)};top:{mm(FOLD_Y + 1)};font-size:5pt;color:#666">сгиб</div>')
    return (f'<svg class="abs" viewBox="0 0 {PW} {PH}" style="left:0;top:0;width:{PW}mm;height:{PH}mm">{svg}</svg>'
            + labels)


CSS = FONTS + f"""
@page {{ size: {PW}mm {PH}mm; margin: 0 }}
* {{ box-sizing: border-box; margin: 0; padding: 0 }}
body {{ font-family: Rubik, sans-serif; color: {INK}; -webkit-print-color-adjust: exact; print-color-adjust: exact }}
.sheet {{ width: {PW}mm; height: {PH}mm; position: relative; overflow: hidden; page-break-after: always; background: #fff }}
.abs {{ position: absolute }}
"""


def sheet() -> str:
    # внешняя сторона: верхняя половина листа, повёрнута на 180°, чтобы после сгиба оказаться на обороте прямо
    ox, oy = X0 - BLEED, Y0 - BLEED
    ow, oh = 2 * W + 2 * BLEED, H + BLEED + 2
    outside = (f'<div class="abs" style="left:{mm(ox)};top:{mm(oy)};width:{mm(ow)};height:{mm(oh)};transform:rotate(180deg);overflow:hidden">'
               f'<div class="abs" style="left:{BLEED}mm;top:2mm;width:{mm(2 * W)};height:{mm(H)}">{outside_spread()}</div></div>')
    inside = (f'<div class="abs" style="left:{mm(X0)};top:{mm(FOLD_Y)};width:{mm(2 * W)};height:{mm(H)};overflow:hidden">'
              f'{inside_spread()}</div>')
    return f'<div class="sheet">{inside}{outside}{marks()}</div>'


def instructions() -> str:
    steps = [
        "Печать: A4, масштаб <b>100 %</b> (не «по размеру страницы»), одна сторона. Бумага матовая 160–200 г/м².",
        "Сначала, пока лист плоский, прорежьте ножом по линейке <b>две косые прорези</b> на нижней половине (тонкие линии у уголков пунктирного контура). Только этот слой.",
        "Обрежьте лист по уголкам-меткам.",
        "Продавите линии сгиба тупой стороной ножа или пустой ручкой по линейке (по пунктирным меткам).",
        "Согните по горизонтали <b>синей стороной наружу</b>: синяя половина уходит назад. Получится двойной лист: внутри белая сторона, снаружи синяя.",
        "Склейте слои клеем-карандашом: <b>левую половину целиком</b>, правую — только узкой полоской 5 мм по краям, чтобы уголки карты проходили между слоями.",
        "Согните пополам по вертикали, как книжку.",
        "Вставьте карту картинкой вверх: сначала левый верхний уголок в прорезь, потом правый нижний.",
    ]
    li = "".join(f"<li>{s}</li>" for s in steps)
    return f"""<div class="sheet" style="padding:16mm 22mm">
  <div style="font-size:18pt;font-weight:500;color:{BLUE}">Как собрать обложку для карты</div>
  <div style="font-size:9pt;color:{GREY};margin:2mm 0 6mm">Эту страницу печатать не обязательно. Готовая обложка {W:.0f} × {H:.0f} мм.</div>
  <ol style="font-size:10.5pt;line-height:1.55;padding-left:6mm;max-width:200mm">{li}</ol>
</div>"""


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    make_logos()
    doc = f'<!doctype html><html lang="cs"><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
    (BUILD / "folder.html").write_text(doc + sheet() + instructions() + "</body></html>", encoding="utf-8")
    print("build/folder.html")


if __name__ == "__main__":
    main()
