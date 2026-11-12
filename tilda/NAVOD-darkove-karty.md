# Подарочные карты с кошками: что где

## Где живёт

- **Страница /darkove-karty**: Tilda page 382960503 (копия /darky, с общей корзиной), блок T123 = `tilda/pages/darkove-karty.html`.
  «Do košíku» кладёт в корзину товар без uid: `Dárkový poukaz NARIN – elektronický 500 Kč` или `… – plastová karta …`.
- **Картинки карт**: `web/public/darkove-karty/kocka-*.jpg` на narin-work.vercel.app (страница, корзина, письмо получателю).
- **Корзина (Footer, rec 5554679303, `tilda/blocks/cart-drawer.html`)**: для электронных карт пишет
  «Kartu pošleme e-mailem, bez poplatku», за карты баллы не обещает, строка про кошек.
- **Касса /payment (rec 4923114303, `tilda/checkout/payment-live.html`, патч `tilda/checkout/patch_vouchers.py`)**:
  - в корзине только электронные карты: шаги «Vaše údaje» → «Komu kartu pošleme?» → «Platba»; доставки нет,
    сервисного сбора нет, оплата только картой. «Obdarovanému» = e-mail, имя, věnování, «Hned» или день (9:00, до 60 дней);
  - карта + цветы/товары: обычные шаги, в шаге 2 дополнительно блок «Elektronická dárková karta»;
  - пластиковая карта = обычный товар с доставкой или самовывозом;
  - в итогах плашка «🐾 Z každé dárkové karty posíláme 50 Kč kočkám…».
  Данные уходят в заказ скрытыми полями `voucher-recipient-email / -name / -message / -send-on`.
- **База** (уже работает, менять не нужно): триггер `zz_voucher_orders_after` после оплаты выпускает код
  на сумму оплаченной цены, шлёт письмо сразу или в день отправки в 9:00 (cron `send-due-vouchers`).
  Пластик (`plastov` в названии) код не выпускает: менеджеру сообщение «вручите карточку», он включает её по коду.
- Откат кассы: код из `tilda/checkout/payment-backup-2026-11-12.html` в rec 4923114303, опубликовать /payment.

## Ведение

- **Пластик закончился**: в коде страницы `var PLASTIC_SOLD_OUT = {1500: true};`.
- **Сколько отправить кошкам**: дашборд «Сертификаты», жёлтая строка — сумма за прошлый месяц.
- **После перевода**: `var CATS_SENT = 0;` → общая сумма, на странице появится счётчик.
- Старый скрытый товар «Dárkový poukaz» (uid 548930360644) больше не нужен, остаётся скрытым.
