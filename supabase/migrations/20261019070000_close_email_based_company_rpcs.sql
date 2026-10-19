-- Firemni ucet (members/b2b) uz bere data pres edge funkci company-portal, ktera overuje token
-- (lk_auth_token). Funkce s parametrem p_email, ktere anon klic volal "podle e-mailu" bez dukazu
-- vlastnictvi, se uzaviraji. Spoustet AZ po nasazeni company-portal a novych stranek.
REVOKE EXECUTE ON FUNCTION public.list_my_companies(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_company_invoices(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_company_balance_transactions(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_company_request(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_invoice_with_company(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_invoice_period_orders(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_invoice(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_companies(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_company_invoices(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_company_balance_transactions(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_company_request(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_with_company(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_invoice_period_orders(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_invoice(text, uuid) TO service_role;
