"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { formatDate } from "@/lib/format";
// Динамический импорт: сам генератор тянет за собой jsPDF + qrcode +
// вшитые шрифт/логотип (~600 КБ) — если импортировать статически, эти
// байты грузятся на КАЖДОЕ открытие страницы "Бизнес", даже если никто
// не жмёт "Скачать PDF". Так — только по клику.
const loadInvoicePdf = () => import("@/lib/invoice-pdf");

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
  balance: number;
};

type RegistrationRequestRow = {
  id: string;
  email: string;
  ico: string;
  full_name: string;
  phone: string;
  backup_email: string | null;
  telegram: string | null;
  ares_name: string;
  ares_address: string | null;
  ares_dic: string | null;
  ares_is_vat_payer: boolean;
  created_at: string;
};

type BalanceTxRow = {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

const BALANCE_TX_TYPE_LABELS: Record<string, string> = {
  topup: "Пополнение",
  adjustment: "Ручная корректировка",
  invoice_payment: "Списание за счёт",
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

// Готовые заготовки для композера — менеджер жмёт кнопку, текст
// подставляется с именем компании/контакта, дальше можно поправить
// руками перед отправкой. Текст на чешском — письма уходят клиенту.
const EMAIL_TEMPLATES: {
  key: string;
  label: string;
  subject: (c: CompanyRow) => string;
  body: (c: CompanyRow) => string;
}[] = [
  {
    key: "welcome",
    label: "Приветствие нового клиента",
    subject: () => "Vítejte u NARIN — jak funguje naše spolupráce",
    body: (c) =>
      `Dobrý den${c.contact_name ? " " + c.contact_name : ""},\n\nděkujeme, že jste si pro ${c.name} vybrali právě NARIN. Rádi bychom vám krátce představili, jak spolupráce funguje:\n\n– Objednávky vyřizujeme průběžně podle vaší potřeby.\n– Na konci měsíce vystavíme jeden souhrnný přehled/fakturu za všechny objednávky.\n– Splatnost je standardně 30 dní, platba převodem.\n\nBudeme rádi za jakékoli dotazy — stačí odpovědět na tento e-mail.\n\nS pozdravem,\ntým NARIN`,
  },
  {
    key: "payment_reminder",
    label: "Напоминание об оплате",
    subject: () => "Připomínka — nezaplacená faktura NARIN",
    body: (c) =>
      `Dobrý den${c.contact_name ? " " + c.contact_name : ""},\n\ndovolujeme si připomenout, že za ${c.name} evidujeme nezaplacenou fakturu po splatnosti. Platební údaje najdete přímo na faktuře (QR kód pro rychlou platbu).\n\nPokud už platba proběhla, omluvte prosím tuto zprávu a dejte nám vědět.\n\nDěkujeme,\ntým NARIN`,
  },
  {
    key: "subscription_pitch",
    label: "Предложение регулярной подписки",
    subject: () => "Pravidelné dodávky květin pro vás — bez starostí a se slevou",
    body: (c) =>
      `Dobrý den${c.contact_name ? " " + c.contact_name : ""},\n\nvšimli jsme si, že ${c.name} u nás objednává pravidelně — napadlo nás, že by pro vás mohla být pohodlnější pravidelná dodávka místo jednotlivých objednávek.\n\nVýhody:\n– Nemusíte znovu objednávat, květiny dorazí samy podle domluveného rytmu.\n– Sleva za pravidelnost.\n– Jeden souhrnný účet místo více faktur.\n\nDáte nám vědět, pokud by vás to zajímalo? Rádi probereme detaily.\n\nS pozdravem,\ntým NARIN`,
  },
  {
    key: "seasonal",
    label: "Сезонное предложение / каталог",
    subject: () => "Nová sezónní nabídka květin od NARIN",
    body: (c) =>
      `Dobrý den${c.contact_name ? " " + c.contact_name : ""},\n\nrádi bychom vás informovali o naší aktuální sezónní nabídce — pokud by se něco hodilo pro ${c.name}, dejte nám vědět a připravíme nabídku na míru.\n\nS pozdravem,\ntým NARIN`,
  },
  {
    key: "thank_you",
    label: "Спасибо за заказ / чек-ин",
    subject: () => "Děkujeme za spolupráci",
    body: (c) =>
      `Dobrý den${c.contact_name ? " " + c.contact_name : ""},\n\nchtěli jsme jen poděkovat za dosavadní spolupráci s ${c.name} — velmi si jí vážíme. Pokud máte jakékoli přání nebo zpětnou vazbu ke kyticím či doručování, budeme rádi za pár slov.\n\nS pozdravem,\ntým NARIN`,
  },
];

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
  const { profile, user } = useDashboard();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debtByCompany, setDebtByCompany] = useState<Map<string, { unpaid: number; overdueCount: number }>>(new Map());

  const [pendingRequests, setPendingRequests] = useState<RegistrationRequestRow[]>([]);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);

  const [balanceTx, setBalanceTx] = useState<BalanceTxRow[]>([]);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceType, setBalanceType] = useState<"topup" | "adjustment">("topup");
  const [balanceDescription, setBalanceDescription] = useState("");
  const [balanceSubmitting, setBalanceSubmitting] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

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

  async function loadPendingRequests() {
    const supabase = createClient();
    const { data } = await supabase
      .from("company_registration_requests")
      .select("id, email, ico, full_name, phone, backup_email, telegram, ares_name, ares_address, ares_dic, ares_is_vat_payer, created_at")
      .eq("status", "pending")
      .order("created_at");
    setPendingRequests(data ?? []);
  }

  async function loadCompanies() {
    setLoading(true);
    const supabase = createClient();
    const [companiesRes, invoicesRes] = await Promise.all([
      supabase.from("companies").select("*").order("name"),
      supabase.from("company_invoices").select("company_id, total_amount, status, due_date"),
    ]);
    loadPendingRequests();

    const today = new Date().toISOString().slice(0, 10);
    const debtMap = new Map<string, { unpaid: number; overdueCount: number }>();
    for (const inv of invoicesRes.data ?? []) {
      if (inv.status === "paid" || inv.status === "cancelled") continue;
      const entry = debtMap.get(inv.company_id) ?? { unpaid: 0, overdueCount: 0 };
      entry.unpaid += inv.total_amount;
      if (inv.due_date && inv.due_date < today) entry.overdueCount += 1;
      debtMap.set(inv.company_id, entry);
    }

    setCompanies(companiesRes.data ?? []);
    setDebtByCompany(debtMap);
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
    const [membersRes, subsRes, ordersRes, invoicesRes, balanceTxRes] = await Promise.all([
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
      supabase
        .from("company_balance_transactions")
        .select("id, amount, type, description, created_by, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setMembers(membersRes.data ?? []);
    setSubs(subsRes.data ?? []);
    setOrders(ordersRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);
    setBalanceTx(balanceTxRes.data ?? []);
    setLoadingDetail(false);
  }

  // Найти-или-создать компанию по IČO из заявки — та же логика, что была
  // раньше в register-company, просто теперь запускается менеджером по
  // кнопке "Одобрить", а не автоматически сразу после ARES-проверки.
  async function approveRequest(req: RegistrationRequestRow) {
    setRequestActionId(req.id);
    setRequestActionError(null);
    const supabase = createClient();
    try {
      const { data: existing } = await supabase.from("companies").select("id").eq("ico", req.ico).maybeSingle();
      let companyId = existing?.id as string | undefined;

      if (!companyId) {
        const { data: created, error: createErr } = await supabase
          .from("companies")
          .insert({
            name: req.ares_name,
            ico: req.ico,
            dic: req.ares_dic,
            is_vat_payer: req.ares_is_vat_payer,
            billing_address: req.ares_address,
            contact_name: req.full_name,
            contact_email: req.email,
            contact_phone: req.phone,
          })
          .select("id")
          .single();
        if (createErr || !created) throw new Error(createErr?.message || "Не удалось создать компанию");
        companyId = created.id;
      }

      const { count: memberCount } = await supabase
        .from("company_members")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);

      const { error: memberErr } = await supabase.from("company_members").upsert(
        {
          company_id: companyId,
          email: req.email,
          full_name: req.full_name,
          phone: req.phone,
          backup_email: req.backup_email,
          telegram: req.telegram,
          role: !memberCount || memberCount === 0 ? "admin" : "member",
        },
        { onConflict: "company_id,email" }
      );
      if (memberErr) throw new Error(memberErr.message);

      const { error: reqErr } = await supabase
        .from("company_registration_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: user?.email ?? null, company_id: companyId })
        .eq("id", req.id);
      if (reqErr) throw new Error(reqErr.message);

      await loadCompanies();

      // Письмо — best-effort: если Brevo не ответит, заявка всё равно
      // одобрена и компания создана, просто менеджер увидит ошибку и
      // сможет написать вручную через "Написать письмо".
      try {
        const { wrapBusinessEmail } = await import("@/lib/business-email-template");
        const bodyText = `Dobrý den ${req.full_name},\n\nváš firemní účet pro ${req.ares_name} byl schválen. V osobním kabinetu na našem webu najdete:\n\n– Zůstatek na účtu a historii pohybů. Účet si můžete kdykoli nabít převodem — příští faktury pak strhneme přímo z něj, nemusíte platit každou zvlášť.\n– Faktury ke stažení v PDF.\n– Historii všech objednávek vaší firmy.\n\nKabinet najdete zde: https://vezminarin.cz/members/business (přihlaste se stejným e-mailem, na který přišel tento dopis).\n\nPokud budete chtít účet nabít nebo budete mít jakýkoli dotaz, stačí odpovědět na tento e-mail.\n\nS pozdravem,\ntým NARIN`;
        await sendEmail(req.email, `Váš firemní účet NARIN je aktivní — ${req.ares_name}`, wrapBusinessEmail(bodyText));
      } catch (emailErr) {
        setRequestActionError(
          `Компания создана, но письмо не отправилось: ${emailErr instanceof Error ? emailErr.message : "неизвестная ошибка"}`
        );
      }
    } catch (err) {
      setRequestActionError(err instanceof Error ? err.message : "Не удалось одобрить заявку");
    } finally {
      setRequestActionId(null);
    }
  }

  async function rejectRequest(req: RegistrationRequestRow) {
    setRequestActionId(req.id);
    setRequestActionError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("company_registration_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: user?.email ?? null })
      .eq("id", req.id);
    if (error) setRequestActionError(error.message);
    await loadPendingRequests();
    setRequestActionId(null);
  }

  async function addBalanceTransaction() {
    if (!selected) return;
    const amountNum = Number(balanceAmount);
    if (!balanceAmount || Number.isNaN(amountNum) || amountNum === 0) {
      setBalanceError("Укажите сумму (можно отрицательную для списания)");
      return;
    }
    setBalanceSubmitting(true);
    setBalanceError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("add_company_balance_transaction", {
      p_company_id: selected.id,
      p_amount: amountNum,
      p_type: balanceType,
      p_description: balanceDescription.trim() || null,
      p_created_by: user?.email ?? null,
    });
    if (error) {
      setBalanceError(error.message);
      setBalanceSubmitting(false);
      return;
    }
    setBalanceAmount("");
    setBalanceDescription("");
    setBalanceSubmitting(false);
    const { data: freshCompany } = await supabase.from("companies").select("*").eq("id", selected.id).single();
    if (freshCompany) setSelected(freshCompany);
    await loadDetail(freshCompany ?? selected);
    await loadCompanies();
  }

  function selectCompany(company: CompanyRow) {
    setSelected(company);
    setMemberEmail("");
    setMemberRole("member");
    setMemberBudget("");
    setInvoiceFrom("");
    setInvoiceTo("");
    setInvoiceError(null);
    setComposerOpen(false);
    setSendInvoiceError(null);
    setBalanceAmount("");
    setBalanceDescription("");
    setBalanceType("topup");
    setBalanceError(null);
    setPayInvoiceError(null);
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
      const { generateAndDownloadInvoicePdf } = await loadInvoicePdf();
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

  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payInvoiceError, setPayInvoiceError] = useState<string | null>(null);

  // Списание счёта с баланса компании — атомарно через тот же RPC, что
  // и ручное пополнение, просто с отрицательной суммой и типом
  // invoice_payment, плюс сама фактура помечается оплаченной.
  async function payInvoiceFromBalance(inv: InvoiceRow) {
    if (!selected) return;
    if (selected.balance < inv.total_amount) {
      setPayInvoiceError(`Недостаточно средств на балансе (доступно ${selected.balance} Kč, нужно ${inv.total_amount} Kč)`);
      return;
    }
    setPayingInvoiceId(inv.id);
    setPayInvoiceError(null);
    const supabase = createClient();
    const { error: balanceErr } = await supabase.rpc("add_company_balance_transaction", {
      p_company_id: selected.id,
      p_amount: -inv.total_amount,
      p_type: "invoice_payment",
      p_description: inv.invoice_number ? `Faktura č. ${inv.invoice_number}` : "Faktura",
      p_created_by: user?.email ?? null,
    });
    if (balanceErr) {
      setPayInvoiceError(balanceErr.message);
      setPayingInvoiceId(null);
      return;
    }
    await supabase.from("company_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", inv.id);
    const { data: freshCompany } = await supabase.from("companies").select("*").eq("id", selected.id).single();
    if (freshCompany) setSelected(freshCompany);
    await loadDetail(freshCompany ?? selected);
    await loadCompanies();
    setPayingInvoiceId(null);
  }

  function isOverdue(inv: InvoiceRow) {
    const today = new Date().toISOString().slice(0, 10);
    return inv.status === "sent" && !!inv.due_date && inv.due_date < today;
  }

  async function sendEmail(to: string, subject: string, html: string, attachments?: { base64: string; filename: string }[]) {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Нет активной сессии");

    const res = await fetch("/api/business/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({ content: a.base64, name: a.filename })),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Не удалось отправить письмо");
  }

  // <input type="file"> отдаёт File — Brevo хочет содержимое как base64
  // без префикса data:...;base64,.
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [sendInvoiceError, setSendInvoiceError] = useState<string | null>(null);

  async function sendInvoiceByEmail(inv: InvoiceRow) {
    if (!selected) return;
    setSendingInvoiceId(inv.id);
    setSendInvoiceError(null);
    try {
      const periodOrders = orders.filter(
        (o) => o.delivery_date && o.delivery_date >= inv.period_start && o.delivery_date <= inv.period_end
      );
      const { generateInvoicePdfAttachment } = await loadInvoicePdf();
      const { base64, filename, number } = await generateInvoicePdfAttachment(selected, inv, periodOrders);
      const { wrapBusinessEmail } = await import("@/lib/business-email-template");
      const bodyText = `Dobrý den,\n\nposíláme fakturu č. ${number} za období ${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}, celkem ${inv.total_amount} Kč, splatnost do ${inv.due_date ? formatDate(inv.due_date) : "—"}.\n\nFaktura je přiložena v PDF.\n\nDěkujeme,\ntým NARIN`;
      await sendEmail(selected.contact_email, `Faktura č. ${number} — NARIN`, wrapBusinessEmail(bodyText), [{ base64, filename }]);
      if (!inv.invoice_number) await loadDetail(selected); // подтянуть присвоенный номер
      if (inv.status === "draft") await setInvoiceStatus(inv.id, "sent");
    } catch (err) {
      setSendInvoiceError(err instanceof Error ? err.message : "Не удалось отправить");
    } finally {
      setSendingInvoiceId(null);
    }
  }

  // Свободное письмо — не привязано к конкретному счёту, для любой
  // связи с компанией прямо из карточки. Можно приложить свои файлы
  // (фото, счета и т.д.) — читаются в base64 прямо в браузере.
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTo, setComposerTo] = useState("");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [composerSending, setComposerSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerSent, setComposerSent] = useState(false);

  function openComposer() {
    if (!selected) return;
    setComposerOpen(true);
    setComposerTo(selected.contact_email);
    setComposerSubject("");
    setComposerBody("");
    setComposerFiles([]);
    setComposerError(null);
    setComposerSent(false);
  }

  async function sendComposerEmail() {
    if (!composerTo.trim() || !composerSubject.trim() || !composerBody.trim()) {
      setComposerError("Заполните получателя, тему и текст");
      return;
    }
    setComposerSending(true);
    setComposerError(null);
    try {
      const { wrapBusinessEmail } = await import("@/lib/business-email-template");
      const attachments = await Promise.all(
        composerFiles.map(async (f) => ({ base64: await fileToBase64(f), filename: f.name }))
      );
      await sendEmail(composerTo.trim(), composerSubject.trim(), wrapBusinessEmail(composerBody), attachments);
      setComposerSent(true);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : "Не удалось отправить");
    } finally {
      setComposerSending(false);
    }
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

      {!loading && debtByCompany.size > 0 && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Не оплачено всего</p>
            <p className="text-lg font-semibold">
              {[...debtByCompany.values()].reduce((s, d) => s + d.unpaid, 0)} Kč
            </p>
          </div>
          <div className="ml-6">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Просроченных счетов</p>
            <p className={`text-lg font-semibold ${[...debtByCompany.values()].some((d) => d.overdueCount > 0) ? "text-red-600 dark:text-red-400" : ""}`}>
              {[...debtByCompany.values()].reduce((s, d) => s + d.overdueCount, 0)}
            </p>
          </div>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Заявки на регистрацию ({pendingRequests.length})
          </p>
          {requestActionError && <p className="text-sm text-red-600 dark:text-red-400">{requestActionError}</p>}
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white dark:bg-zinc-900 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {req.ares_name} · IČO {req.ico}
                    {req.ares_is_vat_payer && " · плательщик НДС"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {req.full_name} · {req.email} · {req.phone}
                    {req.telegram && ` · ${req.telegram}`}
                    {req.backup_email && ` · запасной: ${req.backup_email}`}
                  </p>
                  {req.ares_address && <p className="text-xs text-zinc-400 dark:text-zinc-500">{req.ares_address}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approveRequest(req)}
                    disabled={requestActionId === req.id}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {requestActionId === req.id ? "…" : "Одобрить"}
                  </button>
                  <button
                    onClick={() => rejectRequest(req)}
                    disabled={requestActionId === req.id}
                    className="rounded-md px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-3">
              <button onClick={openComposer} className="text-sm text-accent hover:underline">
                Написать письмо
              </button>
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                Закрыть
              </button>
            </div>
          </div>

          {composerOpen && (
            <div className="rounded-md border border-zinc-100 dark:border-zinc-800 p-3">
              {composerSent ? (
                <p className="text-sm text-green-600 dark:text-green-400">Письмо отправлено.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {EMAIL_TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => {
                          setComposerSubject(t.subject(selected));
                          setComposerBody(t.body(selected));
                        }}
                        className="rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Кому</span>
                      <input
                        value={composerTo}
                        onChange={(e) => setComposerTo(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Тема</span>
                      <input
                        value={composerSubject}
                        onChange={(e) => setComposerSubject(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Текст</span>
                    <textarea
                      value={composerBody}
                      onChange={(e) => setComposerBody(e.target.value)}
                      rows={5}
                      className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <div className="space-y-1">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 dark:border-zinc-600 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      📎 Прикрепить файлы (фото, счета…)
                      <input
                        type="file"
                        multiple
                        onChange={(e) => setComposerFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                        className="hidden"
                      />
                    </label>
                    {composerFiles.length > 0 && (
                      <ul className="space-y-0.5">
                        {composerFiles.map((f, i) => (
                          <li key={i} className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                            <span>
                              {f.name} · {(f.size / 1024).toFixed(0)} КБ
                            </span>
                            <button
                              onClick={() => setComposerFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="text-zinc-300 hover:text-red-600 dark:text-zinc-600 dark:hover:text-red-400"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {composerError && <p className="text-sm text-red-600 dark:text-red-400">{composerError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={sendComposerEmail}
                      disabled={composerSending}
                      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      {composerSending ? "Отправляем…" : "Отправить"}
                    </button>
                    <button
                      onClick={() => setComposerOpen(false)}
                      className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {loadingDetail && <p className="text-sm text-zinc-400 dark:text-zinc-500">Загрузка…</p>}

          {!loadingDetail && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-zinc-100 dark:border-zinc-800 p-3 md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Баланс компании</p>
                  <p className="text-lg font-semibold">{selected.balance} Kč</p>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {balanceTx.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {BALANCE_TX_TYPE_LABELS[t.type] ?? t.type}
                        {t.description && ` — ${t.description}`} · {formatDate(t.created_at)}
                      </span>
                      <span className={t.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {t.amount >= 0 ? "+" : ""}
                        {t.amount} Kč
                      </span>
                    </div>
                  ))}
                  {balanceTx.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Пока нет операций</p>}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Сумма (Kč)</span>
                    <input
                      type="number"
                      value={balanceAmount}
                      onChange={(e) => setBalanceAmount(e.target.value)}
                      placeholder="напр. 5000 или -500"
                      className="w-40 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Тип</span>
                    <select
                      value={balanceType}
                      onChange={(e) => setBalanceType(e.target.value as "topup" | "adjustment")}
                      className="rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    >
                      <option value="topup">Пополнение</option>
                      <option value="adjustment">Ручная корректировка</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Комментарий</span>
                    <input
                      value={balanceDescription}
                      onChange={(e) => setBalanceDescription(e.target.value)}
                      placeholder="напр. перевод от 30.8"
                      className="w-48 rounded-md border border-zinc-300 dark:border-zinc-600 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    onClick={addBalanceTransaction}
                    disabled={balanceSubmitting}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Провести
                  </button>
                </div>
                {balanceError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{balanceError}</p>}
              </div>

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
                  {invoices.map((inv) => {
                    const overdue = isOverdue(inv);
                    return (
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
                        <button
                          onClick={() => sendInvoiceByEmail(inv)}
                          disabled={sendingInvoiceId === inv.id}
                          className="text-xs text-accent hover:underline disabled:opacity-50"
                        >
                          {sendingInvoiceId === inv.id ? "Отправляем…" : "Отправить на email"}
                        </button>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            overdue ? INVOICE_STATUS_COLORS.overdue : INVOICE_STATUS_COLORS[inv.status]
                          }`}
                        >
                          {overdue ? INVOICE_STATUS_LABELS.overdue : INVOICE_STATUS_LABELS[inv.status]}
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
                            onClick={() => payInvoiceFromBalance(inv)}
                            disabled={payingInvoiceId === inv.id}
                            className="text-xs text-accent hover:underline disabled:opacity-50"
                            title="Списать сумму счёта с баланса компании и пометить оплаченным"
                          >
                            {payingInvoiceId === inv.id ? "…" : "Списать с баланса"}
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
                    );
                  })}
                  {invoices.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">Счетов ещё нет</p>}
                  {sendInvoiceError && <p className="text-sm text-red-600 dark:text-red-400">{sendInvoiceError}</p>}
                  {payInvoiceError && <p className="text-sm text-red-600 dark:text-red-400">{payInvoiceError}</p>}
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
            {results.map((c) => {
              const debt = debtByCompany.get(c.id);
              return (
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
                <div className="flex items-center gap-2">
                  {debt && debt.unpaid > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        debt.overdueCount > 0
                          ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {debt.unpaid} Kč{debt.overdueCount > 0 ? " · просрочено" : ""}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(c.created_at)}</span>
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
