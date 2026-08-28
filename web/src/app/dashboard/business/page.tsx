"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { formatDate } from "@/lib/format";
import { generateAndDownloadInvoicePdf } from "@/lib/invoice-pdf";

type CompanyRow = {
  id: string;
  name: string;
  ico: string | null;
  dic: string | null;
  is_vat_payer: boolean;
  billing_address: string | null;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
};

type MemberRow = {
  id: string;
  email: string;
  role: "admin" | "member";
  monthly_budget: number | null;
};

type OrderRowLite = {
  id: string;
  order_id: string | null;
  created_at: string | null;
  delivery_date: string | null;
  order_total: number | null;
  status: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  due_date: string | null;
  paid_at: string | null;
};

const INVOICE_STATUS_LABELS: Record<InvoiceRow["status"], string> = {
  draft: "Черновик",
  sent: "Отправлен",
  paid: "Оплачен",
  overdue: "Просрочен",
  cancelled: "Отменён",
};

const INVOICE_STATUS_COLORS: Record<InvoiceRow["status"], string> = {
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  sent: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  paid: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  overdue: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  cancelled: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
};

const EMPTY_FORM = {
  name: "",
  ico: "",
  dic: "",
  is_vat_payer: false,
  billing_address: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  notes: "",
};

export default function BusinessPage() {
  const { profile } = useDashboard();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CompanyRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [subs, setSubs] = useState<{ id: string; line_name_snapshot: string; status: string; cycle_price_snapshot: number }[]>([]);
  const [orders, setOrders] = useState<OrderRowLite[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "member">("member");
  const [memberBudget, setMemberBudget] = useState("");
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [emailOtherCompanies, setEmailOtherCompanies] = useState<string[]>([]);

  const [invoiceFrom, setInvoiceFrom] = useState("");
  const [invoiceTo, setInvoiceTo] = useState("");
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  async function loadCompanies() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from("companies").select("*").order("name");
    setCompanies(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (profile?.role === "manager") loadCompanies();
  }, [profile?.role]);

  const results = companies.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.ico ?? "").includes(q) ||
      c.contact_email.toLowerCase().includes(q)
    );
  });

  async function createCompany() {
    if (!form.name.trim() || !form.contact_email.trim()) {
      setCreateError("Название и email обязательны");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const supabase = createClient();
    const { error } = await supabase.from("companies").insert({
      name: form.name.trim(),
      ico: form.ico.trim() || null,
      dic: form.dic.trim() || null,
      is_vat_payer: form.is_vat_payer,
      billing_address: form.billing_address.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim(),
      contact_phone: form.contact_phone.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (error) {
      setCreateError(error.message);
      setCreating(false);
      return;
    }
    setForm(EMPTY_FORM);
    setShowNewForm(false);
    setCreating(false);
    await loadCompanies();
  }

  async function loadDetail(company: CompanyRow) {
    setLoadingDetail(true);
    const supabase = createClient();
    const [membersRes, subsRes, ordersRes, invoicesRes] = await Promise.all([
      supabase.from("company_members").select("id, email, role, monthly_budget").eq("company_id", company.id).order("created_at"),
      supabase
        .from("subscriptions")
        .select("id, line_name_snapshot, status, cycle_price_snapshot")
        .eq("company_id", company.id),
      supabase
        .from("tilda_orders")
        .select("id, order_id, created_at, delivery_date, order_total, status")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("company_invoices")
        .select("id, invoice_number, period_start, period_end, total_amount, status, due_date, paid_at")
        .eq("company_id", company.id)
        .order("period_start", { ascending: false }),
    ]);
    setMembers(membersRes.data ?? []);
    setSubs(subsRes.data ?? []);
    setOrders(ordersRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);
    setLoadingDetail(false);
  }

  function selectCompany(company: CompanyRow) {
    setSelected(company);
    setMemberEmail("");
    setMemberRole("member");
    setMemberBudget("");
    setInvoiceFrom("");
    setInvoiceTo("");
    setInvoiceError(null);
    loadDetail(company);
  }

  async function checkOtherCompanies(email: string) {
    if (!selected || !email.trim()) {
      setEmailOtherCompanies([]);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("company_members")
      .select("company_id, companies(name)")
      .eq("email", email.trim().toLowerCase())
      .neq("company_id", selected.id);
    setEmailOtherCompanies(
      ((data ?? []) as unknown as { companies: { name: string } | null }[])
        .map((r) => r.companies?.name)
        .filter((n): n is string => Boolean(n))
    );
  }

  async function addMember() {
    if (!selected || !memberEmail.trim()) return;
    setMemberSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("company_members").insert({
      company_id: selected.id,
      email: memberEmail.trim().toLowerCase(),
      role: memberRole,
      monthly_budget: memberBudget ? Number(memberBudget) : null,
    });
    if (!error) {
      setMemberEmail("");
      setMemberBudget("");
      setMemberRole("member");
      await loadDetail(selected);
    }
    setMemberSubmitting(false);
  }

  async function removeMember(id: string) {
    if (!selected) return;
    const supabase = createClient();
    await supabase.from("company_members").delete().eq("id", id);
    await loadDetail(selected);
  }

  // Счёт считается по уже доставленным заказам компании за период — не
  // по подписке напрямую, потому что разовые B2B-заказы тоже помечаются
  // company_id и должны попасть в тот же счёт.
  async function generateInvoice() {
    if (!selected || !invoiceFrom || !invoiceTo) {
      setInvoiceError("Укажите период");
      return;
    }
    setInvoiceSubmitting(true);
    setInvoiceError(null);
    const supabase = createClient();

    const { data: periodOrders, error: ordersErr } = await supabase
      .from("tilda_orders")
      .select("order_total")
      .eq("company_id", selected.id)
      .eq("status", "delivered")
      .gte("delivery_date", invoiceFrom)
      .lte("delivery_date", invoiceTo);

    if (ordersErr) {
      setInvoiceError(ordersErr.message);
      setInvoiceSubmitting(false);
      return;
    }

    const total = (periodOrders ?? []).reduce((sum, o) => sum + (o.order_total ?? 0), 0);

    const { error } = await supabase.from("company_invoices").insert({
      company_id: selected.id,
      period_start: invoiceFrom,
      period_end: invoiceTo,
      total_amount: total,
      status: "draft",
    });

    if (error) {
      setInvoiceError(error.message);
      setInvoiceSubmitting(false);
      return;
    }

    setInvoiceFrom("");
    setInvoiceTo("");
    setInvoiceSubmitting(false);
    await loadDetail(selected);
  }

  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  async function downloadInvoice(inv: InvoiceRow) {
    if (!selected) return;
    setDownloadingInvoiceId(inv.id);
    try {
      const periodOrders = orders.filter(
        (o) => o.delivery_date && o.delivery_date >= inv.period_start && o.delivery_date <= inv.period_end
      );
      await generateAndDownloadInvoicePdf(selected, inv, periodOrders);
      await loadDetail(selected); // забираем присвоенный номер счёта
    } finally {
      setDownloadingInvoiceId(null);
    }
  }

  async function setInvoiceStatus(invoiceId: string, status: InvoiceRow["status"]) {
    if (!selected) return;
    const supabase = createClient();
    const patch: Record<string, unknown> = { status };
    if (status === "sent") patch.issued_at = new Date().toISOString();
    if (status === "paid") patch.paid_at = new Date().toISOString();
    await supabase.from("company_invoices").update(patch).eq("id", invoiceId);
    await loadDetail(selected);
  }

  if (profile?.role !== "manager") {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Бизнес</h1>
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          + Новая компания
        </button>
      </div>

      {showNewForm && (
        <div className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Название компании *</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Email контакта *</span>
              <input
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">IČO</span>
              <input
                value={form.ico}
                onChange={(e) => setForm({ ...form, ico: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">DIČ (если плательщик НДС)</span>
              <input
                value={form.dic}
                onChange={(e) => setForm({ ...form, dic: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_vat_payer}
                onChange={(e) => setForm({ ...form, is_vat_payer: e.target.checked })}
              />
              <span>Плательщик НДС (plátce DPH)</span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Контактное лицо</span>
              <input
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Телефон</span>
              <input
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Юридический адрес (для счёта)</span>
              <input
                value={form.billing_address}
                onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Заметки</span>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          {createError && <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>}
          <button
            onClick={createCompany}
            disabled={creating}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Создать
          </button>
        </div>
      )}

      {selected && (
        <div className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{selected.name}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {selected.contact_name && `${selected.contact_name} · `}
                {selected.contact_email}
                {selected.contact_phone && ` · ${selected.contact_phone}`}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                IČO: {selected.ico ?? "—"} · DIČ: {selected.dic ?? "—"} ·{" "}
                {selected.is_vat_payer ? "плательщик НДС" : "не плательщик НДС"}
              </p>
              {selected.billing_address && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{selected.billing_address}</p>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              Закрыть
            </button>
          </div>

          {loadingDetail && <p className="text-sm text-zinc-400 dark:text-zinc-500">Загрузка…</p>}

          {!loadingDetail && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-zinc-100 dark:border-zinc-800 p-3">
                <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Кто заказывает от лица компании</p>
                <div className="space-y-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {m.email} · {m.role === "admin" ? "админ" : "сотрудник"}
                        {m.monthly_budget != null && ` · лимит ${m.monthly_budget} Kč/мес`}
                      </span>
                      <button
                        onClick={() => removeMember(m.id)}
                        className="text-zinc-300 hover:text-red-600 dark:text-zinc-600 dark:hover:text-red-400"
                        title="Удалить"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Никого не добавлено</p>}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Email</span>
                    <input
                      value={memberEmail}
                      onChange={(e) => {
                        setMemberEmail(e.target.value);
                        setEmailOtherCompanies([]);
                      }}
                      onBlur={(e) => checkOtherCompanies(e.target.value)}
                      className="w-44 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Роль</span>
                    <select
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value as "admin" | "member")}
                      className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    >
                      <option value="member">Сотрудник</option>
                      <option value="admin">Админ</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Лимит Kč/мес</span>
                    <input
                      type="number"
                      value={memberBudget}
                      onChange={(e) => setMemberBudget(e.target.value)}
                      className="w-24 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    onClick={addMember}
                    disabled={memberSubmitting}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Добавить
                  </button>
                </div>
                {emailOtherCompanies.length > 0 && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Этот email уже заказывает от лица: {emailOtherCompanies.join(", ")}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-zinc-100 dark:border-zinc-800 p-3">
                <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Подписки</p>
                <div className="space-y-1">
                  {subs.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {s.line_name_snapshot} · {s.status === "active" ? "активна" : "отменена"}
                      </span>
                      <span>{s.cycle_price_snapshot} Kč/цикл</span>
                    </div>
                  ))}
                  {subs.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Нет подписок</p>}
                </div>

                <p className="mb-2 mt-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Последние заказы</p>
                <div className="space-y-1">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {formatDate(o.delivery_date)} · №{o.order_id ?? "—"} · {o.status ?? "—"}
                      </span>
                      <span>{o.order_total ?? 0} Kč</span>
                    </div>
                  ))}
                  {orders.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Пока нет заказов</p>}
                </div>
              </div>

              <div className="rounded-md border border-zinc-100 dark:border-zinc-800 p-3 md:col-span-2">
                <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Счета</p>
                <div className="space-y-2">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {inv.invoice_number && <span className="font-mono text-xs text-zinc-400">№{inv.invoice_number} · </span>}
                        {formatDate(inv.period_start)} — {formatDate(inv.period_end)} · {inv.total_amount} Kč
                        {inv.due_date && ` · к оплате до ${formatDate(inv.due_date)}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => downloadInvoice(inv)}
                          disabled={downloadingInvoiceId === inv.id}
                          className="text-xs text-accent hover:underline disabled:opacity-50"
                        >
                          {downloadingInvoiceId === inv.id ? "Готовим…" : "Скачать PDF"}
                        </button>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[inv.status]}`}>
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </span>
                        {inv.status === "draft" && (
                          <button
                            onClick={() => setInvoiceStatus(inv.id, "sent")}
                            className="text-xs text-accent hover:underline"
                          >
                            Отправлен
                          </button>
                        )}
                        {inv.status === "sent" && (
                          <button
                            onClick={() => setInvoiceStatus(inv.id, "paid")}
                            className="text-xs text-accent hover:underline"
                          >
                            Оплачен
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {invoices.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Счетов ещё нет</p>}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Период с</span>
                    <input
                      type="date"
                      value={invoiceFrom}
                      onChange={(e) => setInvoiceFrom(e.target.value)}
                      className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">по</span>
                    <input
                      type="date"
                      value={invoiceTo}
                      onChange={(e) => setInvoiceTo(e.target.value)}
                      className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    onClick={generateInvoice}
                    disabled={invoiceSubmitting}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Сгенерировать счёт за период
                  </button>
                </div>
                {invoiceError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{invoiceError}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Поиск по названию, IČO или email</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="оставьте пустым, чтобы увидеть всех"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-2 text-sm"
          />
        </label>

        {loading && <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">Загрузка…</p>}
        {!loading && results.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">Компаний пока нет</p>
        )}

        {results.length > 0 && (
          <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCompany(c)}
                className={`flex w-full items-center justify-between px-1 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  selected?.id === c.id ? "bg-accent/5" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {c.contact_email}
                    {c.ico && ` · IČO ${c.ico}`}
                  </p>
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(c.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
