// Stripe webhook (slug rapid-processor, v38).
// Pri checkout.session.completed najde objednavku podle metadata.invoiceid
// (PaymentIntent) a oznaci ji "Oplaceno".
// Od 2026-10-19: pres SQL funkci settle_order_payment, ktera navic odepise
// depozit, pokud byla objednavka zaplacena castecne depozitem. Pokud funkce
// v DB jeste neni (migrace 20261019000000 neni aplikovana), pouzije se puvodni
// jednoduchy update stavu - chovani pro objednavky z Tilda se nemeni.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  try {
    const body = await req.json();

    // Логируем тип события, чтобы понимать, что пришло
    console.log(`🔔 Получено событие от Stripe: ${body.type}`);

    if (body.type === 'checkout.session.completed') {
      const session = body.data.object;
      const paymentIntentId = session.payment_intent;
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

      if (!paymentIntentId) {
        console.error("❌ В сессии отсутствует payment_intent");
        return new Response("No payment_intent", { status: 200 });
      }

      console.log(`🔎 Запрашиваю данные PaymentIntent: ${paymentIntentId}`);

      const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Ошибка Stripe API: ${response.status} - ${errorText}`);
        return new Response("Stripe API Error", { status: 200 });
      }

      const piData = await response.json();
      const orderId = piData.metadata?.invoiceid;

      if (orderId) {
        console.log(`🎯 ID заказа извлечен: ${orderId}. Обновляю статус в базе...`);

        // Новый путь: списать депозит (если был) + «Оплачено» одной транзакцией.
        const { data: settled, error: rpcError } = await supabaseAdmin.rpc('settle_order_payment', { p_order_id: orderId });

        if (!rpcError) {
          console.log(`✅ УСПЕХ: заказ ${orderId} обработан`, JSON.stringify(settled));
        } else {
          // Миграция ещё не применена (или RPC недоступен) — прежнее поведение.
          console.error(`⚠️ settle_order_payment недоступна (${rpcError.message}), использую прямой update`);
          const { error } = await supabaseAdmin
            .from('tilda_orders')
            .update({ payment_status: '🟢 Оплачено' })
            .eq('order_id', orderId);

          if (error) {
            console.error(`❌ Ошибка обновления заказа ${orderId} в БД:`, error.message);
            return new Response(`DB Error: ${error.message}`, { status: 200 });
          }
          console.log(`✅ УСПЕХ: Статус заказа ${orderId} изменен на "🟢 Оплачено"`);
        }
      } else {
        console.error("⚠️ Не удалось найти order_id (invoiceid) в метаданных PaymentIntent");
        console.log("Дамп метаданных для проверки:", JSON.stringify(piData.metadata));
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("💥 Критическая ошибка функции:", (err as Error).message);
    return new Response((err as Error).message, { status: 200 });
  }
})
