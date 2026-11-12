# Подарочные карты с кошками: что где

## Где живёт

- **Товары**: 8 товаров Tilda в разделе «Dárkové karty» (part 940179625724, внутри NARIN darky): `Dárkový poukaz 500 Kč elektronický`,
  `… plastová karta` и так для 1 000 / 1 500 / 2 000. uid в `tilda/checkout/gift-card-uids.json`. Остаток пластика = поле «Количество» у товара в Tilda.
- **Полоса на /darky** (`tilda/blocks/darky-page.html`, строка `karty` в CONFIG): 4 карты (по одной на номинал), кнопка «Proč to děláme» → /darkove-karty.
- **Карточка товара** (Footer rec 5302731703, `tilda/blocks/product-popup.html`): для этих uid свой вид — номинал, тип Elektronická/Plastová,
  3 шага, строка про кошек, ссылка на /darkove-karty. Новый номинал = новые товары + строка в `GIFT` в попапе и `UIDS` на странице.

- **Страница /darkove-karty** (рассказ «почему мы это делаем»): Tilda page 382960503, блок T123 = `tilda/pages/darkove-karty.html`. «Do košíku» кладёт те же товары Tilda (по uid).
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
