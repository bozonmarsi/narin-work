# Рассылки NARIN (Brevo)

HTML-шаблоны массовых писем. Картинки лежат в `web/public/email/<кампания>/` и раздаются с `https://narin-work.vercel.app/email/...`
(после мержа в main Vercel публикует их сам).

## navrat-2026-10.html — «Jsme zpět», возвращение + новый e-shop

- **Тема:** `Jsme zpět 🌷 a do neděle vozíme zdarma`
- **Preheader:** уже в тексте письма (скрытая строка сразу после `<body>`).
- **Акция:** бесплатная доставка до воскресенья 11. 10. Включается в Tilda: Настройки магазина → Доставка → цена курьера 0 Kč. **В воскресенье вечером вернуть цену.** Плашки на сайте (`tilda/pages/tap.html` → `CONFIG.promo`, `tilda/blocks/catalog-unified.html` → `PROMO`) исчезают сами после 11. 10. 23:59.
- **Персонализация** (атрибуты контакта в Brevo):
  - `NARIN_UCET` (**Text**, значение `ano`) — у человека есть аккаунт → блок «Váš účet na vás čeká» вместо «150 Kč za registraci».
  - `NARIN_BODY_VETA` (**Text**) — готовая фраза с балансом («Na účtu máte 163 b., to je 163 Kč na příští objednávku.»), пустая при 0 баллов. Считается в SQL, в шаблоне нет условий по числам — так надёжнее.
  - `NARIN_TOKEN` (Text) — личный токен отписки для нашей страницы `vezminarin.cz/odhlaseni?token=…`.
- **Кому:** только `newsletter_subscribers` со статусом `subscribed` — это наш источник правды по согласиям. Кто отписался на `/odhlaseni`, в выгрузку уже не попадёт, поэтому **перед каждой рассылкой выгружайте список заново**.

### 1. Данные в Brevo — одной кнопкой
**NARIN WORK → Пользователи → Рассылка → «Отправить в Brevo».** Кнопка (`/api/newsletter/sync-brevo`):
- создаёт в Brevo атрибуты `NARIN_UCET`, `NARIN_BODY_VETA`, `NARIN_TOKEN` (если их нет);
- кладёт всех подписчиков в список **«NARIN – odběratelé»** с этими данными (существующие контакты обновляются);
- убирает из списка тех, кто отписался на `/odhlaseni`.

В поле рядом можно вписать свой e-mail — после отправки покажет, что именно Brevo получил для этого адреса.
Brevo обрабатывает импорт 1–2 минуты. **Нажимать перед каждой рассылкой.**

Ручной вариант (если кнопка недоступна) — SQL ниже → CSV → Brevo Импорт с «Обновить существующие контакты»:

```sql
SELECT lower(trim(n.email)) AS "EMAIL",
       CASE WHEN p.email IS NOT NULL THEN 'ano' ELSE '' END AS "NARIN_UCET",
       CASE WHEN coalesce(p.balance, 0) > 0
            THEN 'Na účtu máte ' || floor(p.balance)::int || ' b., to je ' || floor(p.balance)::int || ' Kč na příští objednávku.'
            ELSE '' END AS "NARIN_BODY_VETA",
       n.unsubscribe_token::text AS "NARIN_TOKEN"
FROM newsletter_subscribers n
LEFT JOIN LATERAL (
  SELECT email, balance FROM "Tilda points" tp
  WHERE lower(trim(tp.email)) = lower(trim(n.email))
  ORDER BY balance DESC NULLS LAST LIMIT 1
) p ON true
WHERE n.status = 'subscribed'
ORDER BY 1;
```

**Почему в тесте может прийти «150 Kč» вместо баллов:** Brevo подставляет данные того контакта, которому уходит тест. Пока данные не отправлены (или импорт ещё обрабатывается), у контакта пусто → вариант без аккаунта. Сначала кнопка, через пару минут — тест.

### 4. Кампания
Кампании → Создать e-mail → **«Вставить свой HTML»** → вставить `navrat-2026-10.html` целиком → получатели: список «NARIN – odběratelé» → тема и отправитель → **сначала тест на свой e-mail**: проверить, что ссылки и картинки открываются → отправить.

Ссылки в письме помечены `utm_source=email&utm_campaign=navrat`.
