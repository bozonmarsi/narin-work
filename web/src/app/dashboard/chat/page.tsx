"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { formatDate, formatDateTime } from "@/lib/format";

type Conversation = {
  id: string;
  email: string;
  status: string;
  created_at: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_by_manager: boolean;
};

type Message = {
  id: string;
  sender_type: "customer" | "manager";
  body: string;
  created_at: string;
};

type OrderSummary = {
  order_id: string | null;
  customer_name: string | null;
  customer_last_name: string | null;
  order_total: number | null;
  status: string | null;
  created_at: string | null;
};

export default function ChatPage() {
  const { profile } = useDashboard();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pointsBalance, setPointsBalance] = useState<number | null | undefined>(undefined);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function loadConversations() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("support_conversations")
      .select("id, email, status, created_at, last_message_at, last_message_preview, unread_by_manager")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (!error) setConversations(data ?? []);
    setLoadingList(false);
  }

  async function loadMessages(conversationId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("support_messages")
      .select("id, sender_type, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (!error) setMessages(data ?? []);
  }

  useEffect(() => {
    if (profile?.role !== "manager") return;
    loadConversations();
  }, [profile?.role]);

  useRealtimeRefresh("support_messages", () => {
    loadConversations();
    setSelected((current) => {
      if (current) loadMessages(current.id);
      return current;
    });
  });
  useRealtimeRefresh("support_conversations", loadConversations);

  async function loadCustomerInfo(email: string) {
    const supabase = createClient();
    setOrders([]);
    setPointsBalance(undefined);

    const [ordersRes, pointsRes] = await Promise.all([
      supabase
        .from("tilda_orders")
        .select("order_id, customer_name, customer_last_name, order_total, status, created_at")
        .eq("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("Tilda points").select("balance").eq("email", email).maybeSingle(),
    ]);

    setOrders(ordersRes.data ?? []);
    setPointsBalance(pointsRes.data?.balance ?? null);
  }

  async function selectConversation(conversation: Conversation) {
    setSelected(conversation);
    setReply("");
    loadMessages(conversation.id);
    loadCustomerInfo(conversation.email);

    if (conversation.unread_by_manager) {
      const supabase = createClient();
      await supabase.from("support_conversations").update({ unread_by_manager: false }).eq("id", conversation.id);
      setConversations((list) => list.map((c) => (c.id === conversation.id ? { ...c, unread_by_manager: false } : c)));
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    const supabase = createClient();
    const body = reply.trim();

    const { error } = await supabase.from("support_messages").insert({
      conversation_id: selected.id,
      sender_type: "manager",
      body,
    });

    if (!error) {
      await supabase
        .from("support_conversations")
        .update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 200) })
        .eq("id", selected.id);
      setReply("");
      loadMessages(selected.id);
      loadConversations();
    }
    setSending(false);
  }

  if (profile?.role !== "manager") {
    return null;
  }

  const customerName = orders[0]?.customer_name
    ? `${orders[0].customer_name} ${orders[0].customer_last_name ?? ""}`.trim()
    : null;

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
      <div className="w-80 flex-shrink-0 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <div className="border-b border-zinc-200 dark:border-zinc-700 p-3">
          <h1 className="text-sm font-semibold">Чат с клиентами</h1>
        </div>
        {loadingList && <p className="p-4 text-sm text-zinc-400 dark:text-zinc-500">Загрузка…</p>}
        {!loadingList && conversations.length === 0 && (
          <p className="p-4 text-sm text-zinc-400 dark:text-zinc-500">Пока нет обращений</p>
        )}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c)}
              className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                selected?.id === c.id ? "bg-accent/5" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate ${c.unread_by_manager ? "font-semibold" : "font-medium"}`}>{c.email}</span>
                {c.unread_by_manager && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent" />}
              </div>
              <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{c.last_message_preview ?? "—"}</p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{formatDateTime(c.last_message_at)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        {!selected && (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
            Выберите обращение слева
          </div>
        )}

        {selected && (
          <>
            <div className="border-b border-zinc-200 dark:border-zinc-700 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{customerName ?? selected.email}</p>
                  {customerName && <p className="text-xs text-zinc-500 dark:text-zinc-400">{selected.email}</p>}
                </div>
                <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                  {pointsBalance !== undefined && pointsBalance !== null && <p>Баланс баллов: {pointsBalance}</p>}
                  {orders.length === 0 && pointsBalance === null ? (
                    <p className="text-amber-600 dark:text-amber-400">Незарегистрирован</p>
                  ) : (
                    <p>{orders.length} заказ(ов) в истории</p>
                  )}
                </div>
              </div>
              {orders.length > 0 && (
                <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
                  {orders.map((o, i) => (
                    <p key={i} className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDate(o.created_at)} · заказ {o.order_id ?? "—"} · {o.order_total ?? 0} Kč · {o.status ?? "—"}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_type === "manager" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      m.sender_type === "manager"
                        ? "bg-accent text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        m.sender_type === "manager" ? "text-white/70" : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {formatDateTime(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Пока нет сообщений</p>}
            </div>

            <div className="flex items-end gap-2 border-t border-zinc-200 dark:border-zinc-700 p-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                rows={2}
                placeholder="Ответ клиенту…"
                className="flex-1 resize-none rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-sm"
              />
              <button
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Отправить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
