# NARIN greeting cards (A6)

`make_cards.py` writes `out/*.svg`: A6 = 105 × 148 mm + 3 mm bleed (111 × 154 mm), 1 unit = 1 mm, all text outlined
(HarfBuzz shaping, fonts in `fonts/`: Fraunces (OFL, static "soft" instances) + Ubuntu). PDFs at physical size via the
scratchpad `topdf.js` tool: `node topdf.js out/X.svg out/X.pdf 111 154`.

- Style: soft pastel cards after the references (lime, blush, rose, sage, butter, ivory), soft flower silhouettes and outlines,
  Fraunces (soft) semibold, regular caps and italic; NARIN colours only on the back logo.
- Fronts (12): 01 Krása jsi ty · 02 Svět je s tebou barevnější · 03 Miluj. Tvoř. Sni. · 04 To nejlepší teprve přijde ·
  05 Zař · 06 Úsměv ti sluší · 07 Víc než jen květiny · 08 Láska k sobě nepotřebuje důvod · 09 Jsi jedinečná ·
  10 Tvé sny se splní. Uvidíš. · 11 Brzy jaro, brzy láska. Fakt. · 12 Všechno dobře dopadne.
- Illustrated (cute.py, hand-drawn look, Caveat font): 13 Ty to zvládneš! (party cat) · 14 Přeju ti všechno, co je fajn.
  A nic, co fajn není. (pencil cat) · 15 Všechno nejlepší! a zař ještě víc (ribbon frame, heart) · 16 to je pro tebe (frog)
  · 17 Jaké štěstí, že tě mám! (crayon heart, a little person cuddling it from the side).
- Love set: 18 LÁSKA + 'Mám s tebou velké štěstí' (Great Vibes script) · 19 S tebou jsem doma (two kittens in a heart)
  · 20 Zlato, poslouchej svoje srdce (goose, Comfortaa) · 21 S tebou mi v duši vždycky svítí slunce (stamp + sun).
- Back (shared): `zadni-strana` — upper part empty (for print or handwriting), logo + QR at the bottom (`QR_URL` placeholder).
- `out/serie.png` — all fronts on one sheet. Needs: `pip install segno uharfbuzz fonttools`.
