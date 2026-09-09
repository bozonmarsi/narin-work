-- Касса (NewOrderModal) теперь может привязать заказ к клиенту по коду с
-- его карты (ma_id, сгенерированный в member_code_assignment) — тот же
-- код, что печатается штрих-кодом CODE128 на карте в личном кабинете
-- (tilda/blocks/loyalty-card.html: getClientCode). Ищем сначала по ma_id,
-- а на случай древних карт без него — по производному коду от id, той же
-- логикой, что и в скрипте карты.
CREATE OR REPLACE FUNCTION lookup_customer_by_code(p_code text)
RETURNS TABLE (email text, balance bigint, ma_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT email, balance, ma_id FROM "Tilda points"
  WHERE (is_manager() OR is_warehouse())
    AND (
      upper(ma_id) = upper(p_code)
      OR upper(replace(id::text, '-', '')) LIKE upper(p_code) || '%'
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION lookup_customer_by_code(text) TO authenticated;

-- Флорист на кассе должен уметь и списать баллы клиента при оплате, и
-- начислить за покупку — раньше это мог только менеджер со страницы
-- "Клиенты".
DROP POLICY IF EXISTS "manager_all_tilda_points" ON "Tilda points";
CREATE POLICY "manager_all_tilda_points" ON "Tilda points"
  FOR ALL USING (is_manager() OR is_warehouse());

DROP POLICY IF EXISTS "manager_all_points_transactions" ON points_transactions;
CREATE POLICY "manager_all_points_transactions" ON points_transactions
  FOR ALL USING (is_manager() OR is_warehouse());
