# NARIN greeting cards (A6)

`make_cards.py` writes `out/*.svg`: A6 = 105 × 148 mm + 3 mm bleed (111 × 154 mm), 1 unit = 1 mm, all text outlined
(HarfBuzz shaping, fonts in `fonts/`: Fraunces (OFL, static "soft" instances) + Ubuntu). PDFs at physical size via the
scratchpad `topdf.js` tool: `node topdf.js out/X.svg out/X.pdf 111 154`.

- Style: soft pastel cards after the references (lime, blush, rose, sage, butter, ivory), soft flower silhouettes and outlines,
  Fraunces (soft) semibold, regular caps and italic; NARIN colours only on the back logo.
- Fronts: `01-krasa-jsi-ty` (Krása jsi ty.), `02-svet-je-s-tebou-barevnejsi` (Svět je s tebou barevnější.).
- Back (shared): `zadni-strana` — upper part empty (for print or handwriting), logo + QR at the bottom (`QR_URL` placeholder).
- `out/prehled.png` — the set side by side. Needs: `pip install segno uharfbuzz fonttools`.
