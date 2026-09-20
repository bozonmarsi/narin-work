-- Раньше invoice-ingest заводил черновик для ЛЮБОГО письма, похожего на
-- фактуру, даже если отправитель вообще не наш поставщик (например
-- биллинг Google Cloud) — засоряло очередь флориста в Приёмке мусором.
-- Новый статус "needs_sender_review": когда письмо распознано как
-- похожее на фактуру, но отправитель не значится ни у одного поставщика
-- в suppliers.invoice_sender_emails, черновик уходит не флористу, а
-- менеджеру на разбор — "разрешить" (регистрирует email за поставщиком
-- и переводит черновик в обычный "pending") или "отклонить" (просто
-- мусор, status = 'rejected', как обычно).
ALTER TABLE invoice_drafts DROP CONSTRAINT IF EXISTS invoice_drafts_status_check;
ALTER TABLE invoice_drafts ADD CONSTRAINT invoice_drafts_status_check
  CHECK (status IN ('pending', 'needs_sender_review', 'confirmed', 'rejected'));

-- RLS на invoice_drafts уже разрешает FOR ALL менеджеру/складу — новый
-- статус ничего дополнительно не требует, просто добавляем в CHECK.
