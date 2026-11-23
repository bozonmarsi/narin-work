"""Production sheet for the arch glass decal: a dimensioned drawing + sizes, colours, material and mounting notes.

    python3 make_spec.py           -> print/NARIN-arch-spec.html (2 pages A4 landscape: Czech for the print shop, Russian)
Measurements are those of print/NARIN-arch-1440x700mm.svg (variant P-garden-line); re-measure if the layout changes.
"""
import pathlib
import re

HERE = pathlib.Path(__file__).parent
PRINT = HERE / "print"
art = (PRINT / "NARIN-arch-1440x700mm.svg").read_text(encoding="utf-8")
art_body = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", art, flags=re.S)
art_body = re.sub(r"<title>.*?</title>", "", art_body, flags=re.S)
ARCH = "M0 700 A720 700 0 0 1 1440 700 Z"

# measured from the print file (mm, origin = top-left of the 1440 x 700 box, y down)
M = {
    "logo": (357.5, 172.5, 725.6, 183.8),      # x, y, w, h
    "line": (147.8, 412.7, 1150.8, 93.5),
    "baseline": 488.6, "cap": 65.1,
    "garden_top": 530.0,
    "keyline_inset": 34, "keyline_w": 4,
}

COLOURS = [("#FFFFFF", "bílá / белый", "logo, text, linka, bílé květy — BÍLÁ BARVA"),
           ("#1C70E3", "kobalt / кобальт", ""), ("#0B4DB5", "modrá / синий", ""),
           ("#FF3B2F", "červená / красный", ""), ("#FF7C77", "korálová / коралловый", ""),
           ("#FFD84A", "žlutá / жёлтый", ""), ("#8B55F6", "fialová / фиолетовый", ""),
           ("#F3CDF6", "lila / сиреневый", ""), ("#2A9A4B", "zelená / зелёный", "stonky, listy"),
           ("#19C98A", "mátová / мятный", "listy"), ("#3DAF5C", "tráva / трава", ""),
           ("#A8DDB8", "světle zelená / светло-зелёный", "žilky listů")]

T = {
    "cz": {
        "title": "NARIN — polepení obloukového skla nad vchodem",
        "sub": "Tiskový podklad · varianta „zahrada“ · všechny míry v mm · 1 jednotka v SVG = 1 mm",
        "w": "1440 mm (šířka skla)", "h": "700 mm", "logo_w": "726", "logo_h": "184", "logo_top": "172",
        "line_w": "1151", "cap": "65", "garden": "170 (zahrada)", "key": "bílá linka 4 mm, 34 mm od okraje",
        "sizes": "Rozměry", "rows": [
            ("Sklo", "oblouk 1440 × 700 mm (půlelipsa, poloosy 720 × 700). <b>Před výrobou prosím přeměřte.</b>"),
            ("Logo NARIN", "726 × 184 mm, horní okraj 172 mm pod vrcholem oblouku, na střed"),
            ("Řádek „Květiny · Dárky · Rostliny“", "šířka 1151 mm, výška velkých písmen 65 mm, účaří 489 mm pod vrcholem"),
            ("Zahrada", "pás 170 mm u spodní hrany skla, květy Ø 52–67 mm"),
            ("Linka podél oblouku", "bílá, tloušťka 4 mm, 34 mm od okraje skla"),
            ("Ořez", "magenta křivka ve vrstvě „CUT contour“ = tvar skla; netisknout"),
        ],
        "colours": "Barvy (RGB HEX, převod do CMYK dle tiskárny)",
        "prod": "Výroba", "prod_rows": [
            "Materiál: čirá (transparentní) samolepicí fólie na sklo, venkovní, plnobarevný tisk + <b>bílý podtisk pod všemi motivy</b> (jinak barvy na skle zprůhlední).",
            "Bílé prvky (logo, text, linka, bílé květy) tisknout <b>bílou barvou</b> — v PDF jsou bílé, na bílém listu nejsou vidět, ale jsou tam.",
            "Laminace: UV ochranná, venkovní (lesk nebo mat).",
            "Ořez: plotrem po magenta obrysu skla (jeden kus). Volitelně ořez podle obrysu motivů — pak s přenosovou fólií.",
            "Lepení <b>z venku</b>: soubor <i>NARIN-arch-1440x700mm</i>. Lepení <b>zevnitř</b> (čte se přes sklo): soubor <i>…-MIRRORED</i>, pořadí vrstev barvy → bílá.",
            "Prosím o náhled / nátisk barev před výrobou.",
        ],
        "files": "Soubory: NARIN-arch-1440x700mm.svg / .pdf (1:1), NARIN-arch-1440x700mm-MIRRORED.svg / .pdf (zrcadlově), texty převedeny do křivek.",
    },
    "ru": {
        "title": "NARIN — наклейка на арочное стекло над входом",
        "sub": "Для типографии · вариант «сад» · все размеры в мм · в SVG 1 единица = 1 мм",
        "w": "1440 мм (ширина стекла)", "h": "700 мм", "logo_w": "726", "logo_h": "184", "logo_top": "172",
        "line_w": "1151", "cap": "65", "garden": "170 (сад)", "key": "белая линия 4 мм, 34 мм от края",
        "sizes": "Размеры", "rows": [
            ("Стекло", "арка 1440 × 700 мм (полуэллипс, полуоси 720 × 700). <b>Перед печатью перемерить.</b>"),
            ("Логотип NARIN", "726 × 184 мм, верх в 172 мм от верхней точки арки, по центру"),
            ("Строка «Květiny · Dárky · Rostliny»", "ширина 1151 мм, высота заглавных букв 65 мм, линия строки в 489 мм от верха"),
            ("Сад", "полоса 170 мм у нижнего края стекла, цветы Ø 52–67 мм"),
            ("Линия вдоль арки", "белая, толщина 4 мм, в 34 мм от края стекла"),
            ("Контур реза", "розовая линия в слое «CUT contour» = форма стекла, не печатается"),
        ],
        "colours": "Цвета (RGB HEX, типография переводит в CMYK)",
        "prod": "Производство", "prod_rows": [
            "Материал: прозрачная самоклеящаяся плёнка для стекла, уличная, полноцветная печать + <b>белая подложка под всеми рисунками</b> (иначе цвета на стекле будут просвечивать).",
            "Белые элементы (логотип, надпись, линия, белые цветы) печатаются <b>белой краской</b>. В PDF они белые и на белом листе не видны, но они там есть.",
            "Ламинация: защитная от УФ, уличная (глянец или мат).",
            "Резка: плоттером по розовому контуру стекла, одним куском. Можно вырезать по контуру рисунков, тогда с монтажной плёнкой.",
            "Клеить <b>снаружи</b>: файл <i>NARIN-arch-1440x700mm</i>. Клеить <b>изнутри</b> (видно через стекло): файл <i>…-MIRRORED</i>, порядок слоёв: цвет → белый.",
            "Попросить у типографии превью и пробную печать цветов перед производством.",
        ],
        "files": "Файлы: NARIN-arch-1440x700mm.svg / .pdf (1:1), NARIN-arch-1440x700mm-MIRRORED.svg / .pdf (зеркально), текст переведён в кривые.",
    },
}


def dim(x1, y1, x2, y2, label, side="above", color="#14204A"):
    """A dimension line with end ticks and a label."""
    horiz = abs(y2 - y1) < 1
    t = 14
    ticks = (f'<path d="M{x1} {y1 - t} V{y1 + t} M{x2} {y2 - t} V{y2 + t}"/>' if horiz
             else f'<path d="M{x1 - t} {y1} H{x1 + t} M{x2 - t} {y2} H{x2 + t}"/>')
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    if horiz:
        ty = my - 12 if side == "above" else my + 34
        txt = f'<text x="{mx}" y="{ty}" text-anchor="middle">{label}</text>'
    else:
        tx = mx + 18 if side == "right" else mx - 18
        anchor = "start" if side == "right" else "end"
        txt = f'<text x="{tx}" y="{my + 9}" text-anchor="{anchor}">{label}</text>'
    return (f'<g stroke="{color}" stroke-width="3" fill="none"><path d="M{x1} {y1} L{x2} {y2}"/>{ticks}</g>'
            f'<g fill="{color}" font-size="30" font-family="Ubuntu, Arial, sans-serif" font-weight="600">{txt}</g>')


def drawing(t):
    lx, ly, lw, lh = M["logo"]
    tx, ty, tw, th = M["line"]
    b, cap, g = M["baseline"], M["cap"], M["garden_top"]
    parts = [f'<path d="{ARCH}" fill="#2E3A52"/>',
             f'<svg x="0" y="0" width="1440" height="700" viewBox="0 0 1440 700">{art_body}</svg>',
             dim(0, 790, 1440, 790, t["w"], "below"),
             dim(1530, 0, 1530, 700, t["h"], "right"),
             dim(lx, ly - 34, lx + lw, ly - 34, t["logo_w"], "above", "#E8EEF8"),
             dim(lx - 30, ly, lx - 30, ly + lh, t["logo_h"], "left", "#E8EEF8"),
             dim(800, 0, 800, ly, t["logo_top"], "right", "#E8EEF8"),
             dim(tx, ty - 18, tx + tw, ty - 18, t["line_w"], "above", "#E8EEF8"),
             dim(tx - 26, b - cap, tx - 26, b, t["cap"], "left", "#E8EEF8"),
             dim(-60, g, -60, 700, t["garden"], "left"),
             f'<g fill="#14204A" font-size="30" font-family="Ubuntu, Arial, sans-serif" font-weight="600">'
             f'<path d="M1335 120 L1250 180" stroke="#14204A" stroke-width="3"/><text x="1340" y="115">{t["key"]}</text></g>']
    return f'<svg viewBox="-330 -60 2150 900" xmlns="http://www.w3.org/2000/svg" class="drw">{"".join(parts)}</svg>'


def page(t):
    rows = "".join(f"<tr><th>{a}</th><td>{b}</td></tr>" for a, b in t["rows"])
    sw = "".join(f'<div class="sw"><i style="background:{h}"></i><span><b>{h}</b> {n}{(" — " + u) if u else ""}</span></div>'
                 for h, n, u in COLOURS)
    prod = "".join(f"<li>{p}</li>" for p in t["prod_rows"])
    return f"""<section class="page">
<h1>{t['title']}</h1><p class="sub">{t['sub']}</p>
{drawing(t)}
<div class="cols">
 <div><h2>{t['sizes']}</h2><table>{rows}</table></div>
 <div><h2>{t['prod']}</h2><ul>{prod}</ul><p class="files">{t['files']}</p></div>
 <div><h2>{t['colours']}</h2><div class="sws">{sw}</div></div>
</div></section>"""


html = f"""<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>NARIN arch spec</title>
<link href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap" rel="stylesheet">
<style>
@page {{ size: A4 landscape; margin: 0 }}
html, body {{ margin: 0; font-family: Ubuntu, Arial, sans-serif; color: #14204A; background: #fff }}
.page {{ width: 297mm; height: 210mm; box-sizing: border-box; padding: 9mm 11mm; page-break-after: always; overflow: hidden }}
h1 {{ font-size: 17pt; margin: 0 }} .sub {{ margin: 1mm 0 2mm; font-size: 9pt; color: #4A5578 }}
h2 {{ font-size: 10pt; margin: 0 0 1.5mm; text-transform: uppercase; letter-spacing: .06em; color: #1C70E3 }}
.drw {{ width: 100%; height: 92mm; display: block }}
.cols {{ display: grid; grid-template-columns: 1.15fr 1.25fr 0.9fr; gap: 6mm; font-size: 7.6pt; line-height: 1.35 }}
table {{ border-collapse: collapse; width: 100% }} th, td {{ text-align: left; vertical-align: top; padding: 1mm 1.5mm 1mm 0; border-top: 0.3mm solid #DCE2EE }}
th {{ width: 34%; font-weight: 700 }}
ul {{ margin: 0; padding-left: 4mm }} li {{ margin-bottom: 1mm }}
.files {{ margin-top: 2mm; color: #4A5578 }}
.sws {{ display: grid; gap: 1mm }} .sw {{ display: flex; gap: 2mm; align-items: center }}
.sw i {{ width: 6mm; height: 4mm; border: 0.3mm solid #B9C2D6; flex: none }}
</style></head><body>{page(T['cz'])}{page(T['ru'])}</body></html>"""
(PRINT / "NARIN-arch-spec.html").write_text(html, encoding="utf-8")
print("print/NARIN-arch-spec.html")
