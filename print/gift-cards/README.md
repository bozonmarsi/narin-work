# Подарочные карты NARIN (пластик, CR80)

85,6 × 54 мм, скругление 3 мм. Страница PDF 89,6 × 58 мм: вылеты по 2 мм, безопасная зона 4 мм.

| Номинал | Лицевая сторона | Карт | Номера в cards.csv |
|---|---|---|---|
| 500 Kč | scene-1, чёрная кошка | 6 | 01–06 |
| 1 000 Kč | scene-2, сиамская кошка | 6 | 07–12 |
| 1 500 Kč | scene-3, белая кошка | 4 | 13–16 |
| 2 000 Kč | scene-4, рыжий котёнок | 4 | 17–20 |

QR ведёт на `https://vezminarin.cz/poukaz?c=<код>`. Так же формирует ссылку `/dashboard/vouchers/print`.

## Файлы

- `out/narin-gift-card-fronts.pdf`: 4 лицевые стороны.
- `out/narin-gift-card-back-templates.pdf`: обороты без QR и кода, по одному на номинал.
- `out/NARIN-zadani-tisku-darkove-karty.pdf`: задание для типографии (на чешском), исходник `zadani-tiskarna.html`.
- `preview/`: PNG с линией реза и безопасной зоной. На них образец кода, не реальный.
- **Не в git** (репозиторий публичный): `cards.csv` с реальными кодами, `out/narin-gift-card-backs.pdf` (20 оборотов) и `out/narin-gift-card-duplex.pdf` (40 страниц, лицо и оборот по очереди). Формат CSV показан в `cards.example.csv`.

## Пересборка

```sh
pip install qrcode pillow
python3 print/gift-cards/build.py
NODE_PATH=<путь к node_modules с playwright-core> node print/gift-cards/render.cjs
```

## Важно при продаже

Сумма напечатана на карте, но в систему она попадает только при включении. Менеджер вводит её вручную. При активации вводите ровно номинал с карты (сверяйтесь с `cards.csv`).
