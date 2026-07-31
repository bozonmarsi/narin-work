-- Внутренние комментарии, которые видит курьер, отдельно от комментария
-- самого клиента (comments, пришедшего из формы Tilda).
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS manager_comment text;
ALTER TABLE tilda_orders ADD COLUMN IF NOT EXISTS florist_comment text;
