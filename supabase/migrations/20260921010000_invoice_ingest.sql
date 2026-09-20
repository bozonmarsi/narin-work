-- Раньше n8n сам решал, какому supplier_id соответствует письмо, сверяя
-- строку supplier_name из текста фактуры со suppliers.name — а эти
-- строки не совпадают дословно ("Van Vliet CZ sro" в письме vs "Van
-- Vliet" у нас), поэтому в форме подтверждения поставщик всегда
-- оставался "не сопоставлен", хотя мы точно знаем, кто прислал письмо,
-- по адресу отправителя. Теперь сопоставление supplier_id делает сама
-- invoice-ingest функция по sender_email — надёжнее, чем сверка имён.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS invoice_sender_emails text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS suppliers_invoice_sender_emails_idx
  ON suppliers USING gin (invoice_sender_emails);

UPDATE suppliers SET invoice_sender_emails = ARRAY['praha@jvanvliet.cz'] WHERE name = 'Van Vliet';
UPDATE suppliers SET invoice_sender_emails = ARRAY['uctenka@storge.cz'] WHERE name = 'Storge';

-- Черновик должен появиться и когда автоматический разбор не нашёл ни
-- одной позиции (незнакомый формат счёта, плохой скан, новый поставщик,
-- для которого ещё нет ни одной подсказки) — раньше в этом случае n8n
-- просто ничего бы не отправил дальше "Code"-ноды, и фактура терялась
-- молча. sender_email и raw_text — чтобы флористу было на что опереться
-- при ручном заполнении, даже когда items = [].
ALTER TABLE invoice_drafts ADD COLUMN IF NOT EXISTS sender_email text;
ALTER TABLE invoice_drafts ADD COLUMN IF NOT EXISTS raw_text text;
