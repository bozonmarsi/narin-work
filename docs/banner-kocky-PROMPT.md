# Баннер «Dárkové karty s kočkami» для карусели на мобильной главной

Формат как у двух текущих баннеров: **1680 × 630 px** (8:3).
В ChatGPT приложите все 6 картинок из этой папки:
- `ref-banner-body.png` и `ref-banner-predplatne.png` — это образец стиля;
- `ref-karta-500/1000/1500/2000.jpg` — это настоящие картины на картах, их нужно повторить точно.

---

## Промт (копировать целиком)

```
Create a wide advertising banner, exactly 1680 x 630 px (8:3), for the Czech flower shop NARIN.
It must look like part of the same series as the two attached banners ("VÍCE BODŮ — VÍCE VÝHOD" and "KVĚTINY, NA KTERÉ NEMUSÍTE MYSLET"): same layout, same typography, same light, same level of polish. Do not invent a new style.

CAMPAIGN
NARIN gift cards for flowers. Every value has its own painting: a cat hidden in a blooming meadow (the 4 attached card paintings). The recipient chooses the flowers. The electronic card arrives by e-mail right after payment; the plastic card comes in a gift envelope. From every card sold NARIN sends 50 Kč to cats in animal shelters, paid by NARIN, the card keeps its full value. The mood: warm, kind, a little playful, premium — never childish, never cartoonish, no charity-sad imagery.

LAYOUT (copy the reference banners)
Left ~45%: text block on a bright, airy, almost white background.
Right ~55%: hyper-realistic 3D product scene with soft depth of field.

TEXT (exactly these Czech words, correct diacritics, nothing else):
1. Small kicker on top, wide letter spacing, inside a soft light-blue pill like "PŘEDPLATNÉ": "DÁRKOVÉ KARTY"
2. Headline, very large heavy geometric sans (same font as references), two lines:
   line 1 in near-black: "DÁREK, KTERÝ"
   line 2 in NARIN bright blue #1a5ff0: "POMÁHÁ KOČKÁM."
3. Sub-text, regular weight, dark grey, two lines:
   "Dárková karta na květiny od 500 Kč."
   "Z každé posíláme 50 Kč kočkám v útulcích."
4. Big rounded blue button (same as "Sestavit předplatné"), white text and a white arrow: "Vybrat kartu  →"

RIGHT SIDE SCENE
- 3 or 4 gift cards (credit-card shape, rounded corners, thin glossy plastic edge) fanned and floating in 3D, slightly tilted toward the viewer, like the cards in the "VÍCE BODŮ" banner. Each card front is one of the attached cat paintings, reproduced faithfully (black cat in a meadow, white cat in violet flowers, siamese cat at sunset, ginger kitten on a garden path). Small white "NARIN" logo in the top-left corner of each card, like on the reference cards.
- These are gift cards, NOT bank cards: no chip, no card number, no tier label.
- One card is half pulled out of an elegant white paper gift envelope with a small blue NARIN seal.
- A real, photographic fluffy cat (soft grey or ginger tabby) sits behind the cards among the flowers and gently touches the front card with its paw, curious and calm. Realistic fur, friendly eyes, not a cartoon.
- Around them: fresh real flowers that match the paintings: white daisies, lavender, cornflowers, pale pink peonies, a few green leaves. Some flower heads sharp in front, some blurred in the foreground corners (same depth of field as the references). A few soft pink and white petals floating in the air.
- 3 small floating white UI chips with soft shadow and a blue icon (same style as "1. týden / 2. týden" in the reference), placed around the cards:
  "✉ Hned e-mailem"
  "🎁 Plastová v obálce"
  "🐾 50 Kč kočkám"

LIGHT AND COLOUR
Bright daylight, soft and clean, white and very light blue background fading to soft bokeh on the right. Colours: white, NARIN blue #1a5ff0, near-black text, the violet/blue/pink of the paintings, warm accents from the siamese/ginger cats. Crisp, high-end commercial render, photorealistic materials.

DO NOT
- add any other text, prices, logos, watermarks or fake small print
- make it cartoon, 2D illustration or children's style
- show sad or caged animals
- crop the headline or the button; keep 40 px safe margin on every side
```

---

## Варианты заголовка (если первый не нравится)

| Строка 1 (чёрная) | Строка 2 (синяя) |
|---|---|
| DÁREK, KTERÝ | POMÁHÁ KOČKÁM. |
| KOČKY V KVĚTECH — | KVĚTINY PRO VÁS. |
| NEVÍTE, CO DAROVAT? | AŤ SI VYBERE SÁM. |

Подменить в промте строки `line 1` и `line 2`. Подзаголовок и кнопка остаются.

## Если что-то вышло не так

- **Буквы с ошибками** (ž, ů, á): попросите «redo only the text, keep the image» или поставьте текст в Tilda поверх картинки без текста. Тогда в промте пункт TEXT замените на «leave the left 45 % empty, no text».
- **Картины на картах не те:** «use the attached card paintings exactly as they are, do not repaint them».
- **Кот мультяшный:** «photographic real cat, like a studio photo, natural fur».
- Ссылка с баннера: `https://vezminarin.cz/darky#ndp-karty` (полоса карт на /darky), или `/darkove-karty` для страницы с историей.
