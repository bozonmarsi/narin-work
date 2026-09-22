-- Инфраструктура под будущие маркетинговые рассылки (email marketing overhaul,
-- фаза 2 из 3). Раньше подписчиков не было вообще — email клиента жил только
-- в tilda_orders. Заводим отдельную таблицу с самого начала (а не запрос по
-- заказам "на лету"), чтобы у каждого адреса был свой статус подписки и
-- персональный токен для одноклик-отписки — это и юридическое требование
-- (soft opt-in по чешскому/EU праву требует рабочий unsubscribe), и то, что
-- нужно Brevo для нормальной репутации отправителя.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  -- 'order_soft_optin': попал сюда автоматически как реальный клиент (soft
  -- opt-in — законно слать про похожие товары/услуги при наличии unsubscribe).
  -- 'signup_form': явная подписка через форму (когда/если она появится) —
  -- задел на будущее, форм пока нет нигде на сайте.
  source text NOT NULL DEFAULT 'order_soft_optin',
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  -- Необязательный фидбек с короткого опроса на странице отписки — реальный
  -- сигнал для маркетинга ("много писем" vs "неинтересно" vs "уже не клиент").
  unsubscribe_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_idx ON newsletter_subscribers (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_token_idx ON newsletter_subscribers (unsubscribe_token);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manager_all_newsletter_subscribers" ON newsletter_subscribers;
CREATE POLICY "manager_all_newsletter_subscribers" ON newsletter_subscribers FOR ALL USING (is_manager());

-- Разовое наполнение: все, кто когда-либо заказывал — это и есть аудитория
-- soft opt-in.
INSERT INTO newsletter_subscribers (email, source)
SELECT DISTINCT lower(btrim(customer_email)), 'order_soft_optin'
FROM tilda_orders
WHERE customer_email IS NOT NULL AND btrim(customer_email) <> ''
ON CONFLICT (lower(email)) DO NOTHING;

-- Дальше держим таблицу в актуальном состоянии сама: как только у нового
-- клиента появляется подтверждённый заказ — он автоматически попадает в
-- soft-opt-in пул. Не трогаем тех, кто уже стоит на unsubscribed — иначе
-- новый заказ той же почтой тихо переподписал бы того, кто явно отписался.
CREATE OR REPLACE FUNCTION tg_newsletter_subscribe_from_order()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'confirmed' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.customer_email IS NOT NULL AND btrim(NEW.customer_email) <> '' THEN
    INSERT INTO newsletter_subscribers (email, source)
    VALUES (lower(btrim(NEW.customer_email)), 'order_soft_optin')
    ON CONFLICT (lower(email)) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_tg_newsletter_subscribe_from_order ON tilda_orders;
CREATE TRIGGER trigger_tg_newsletter_subscribe_from_order
AFTER UPDATE ON tilda_orders
FOR EACH ROW
EXECUTE FUNCTION tg_newsletter_subscribe_from_order();

-- Одноклик-отписка по токену из ссылки в письме — без логина (это ключевое
-- требование самой отписки: она обязана работать в один клик). Тот же
-- паттерн, что и у link_telegram_account/submit_order_review: приватное
-- действие по знанию одноразового/уникального значения, не по паролю.
CREATE OR REPLACE FUNCTION public.unsubscribe_newsletter(p_token uuid)
RETURNS TABLE(ok boolean, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  UPDATE newsletter_subscribers
  SET status = 'unsubscribed', unsubscribed_at = now()
  WHERE unsubscribe_token = p_token AND status = 'subscribed'
  RETURNING newsletter_subscribers.email INTO v_email;

  IF v_email IS NULL THEN
    -- Токен мог быть уже использован раньше — возвращаем email всё равно,
    -- чтобы страница отписки могла показать "вы уже отписаны", а не ошибку.
    SELECT newsletter_subscribers.email INTO v_email FROM newsletter_subscribers WHERE unsubscribe_token = p_token;
  END IF;

  RETURN QUERY SELECT (v_email IS NOT NULL), v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter(uuid) TO anon, authenticated;

-- Необязательный шаг после отписки — короткий "почему уходите" на странице.
-- Отдельная функция, а не параметр unsubscribe_newsletter, потому что это
-- не обязательно для самой отписки (та уже случилась) и может прийти позже.
CREATE OR REPLACE FUNCTION public.record_unsubscribe_reason(p_token uuid, p_reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE newsletter_subscribers SET unsubscribe_reason = p_reason WHERE unsubscribe_token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.record_unsubscribe_reason(uuid, text) TO anon, authenticated;
