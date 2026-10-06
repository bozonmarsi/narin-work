# Рассылки NARIN (Brevo)

HTML-шаблоны массовых писем. Картинки лежат в `web/public/email/<кампания>/` и раздаются с `https://narin-work.vercel.app/email/...`
(после мержа в main Vercel публикует их сам).

## navrat-2026-10.html — «Jsme zpět», возвращение + новый e-shop

- **Тема:** `Jsme zpět 🌷 a do neděle vozíme zdarma`
- **Preheader:** уже в тексте письма (скрытая строка сразу после `<body>`).
- **Акция:** бесплатная доставка до воскресенья 11. 10. Включается в Tilda: Настройки магазина → Доставка → цена курьера 0 Kč. **В воскресенье вечером вернуть цену.** Плашки на сайте (`tilda/pages/tap.html` → `CONFIG.promo`, `tilda/blocks/catalog-unified.html` → `PROMO`) исчезают сами после 11. 10. 23:59.
- **Персонализация** (атрибуты контакта в Brevo):
  - `NARIN_UCET` (Boolean) — у человека есть аккаунт → блок «Váš účet na vás čeká» вместо «150 Kč za registraci».
  - `NARIN_BODY` (Number) — баланс баллов; если > 0, в письме «Na účtu máte N b.».

### 1. Создать атрибуты в Brevo
Контакты → Настройки → Атрибуты контакта → Добавить:
- `NARIN_UCET`, тип **Boolean**;
- `NARIN_BODY`, тип **Number**.

### 2. Выгрузить из Supabase
SQL Editor → выполнить → Download CSV:

```sql
SELECT lower(trim(email))          AS "EMAIL",
       true                        AS "NARIN_UCET",
       greatest(coalesce(balance, 0), 0)::int AS "NARIN_BODY"
FROM "Tilda points"
WHERE email IS NOT NULL AND trim(email) <> ''
ORDER BY 1;
```

### 3. Импортировать в Brevo
Контакты → Импорт → загрузить CSV → сопоставить колонки с атрибутами `EMAIL`, `NARIN_UCET`, `NARIN_BODY` → включить **«Обновить существующие контакты»** → добавить в тот же список, куда идёт рассылка.
У кого аккаунта нет, атрибут останется пустым, и они увидят блок «150 Kč za registraci».

### 4. Кампания
Кампании → Создать e-mail → **«Вставить свой HTML»** → вставить `navrat-2026-10.html` целиком → тема и отправитель → **сначала тест на свой e-mail**: проверить, что ссылки и картинки открываются → отправить.

Ссылки в письме помечены `utm_source=email&utm_campaign=navrat`.
