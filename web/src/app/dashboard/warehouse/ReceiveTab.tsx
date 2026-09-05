"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../layout";
import { decodeHtmlEntities } from "@/lib/format";
import type { RawMaterial, Supplier } from "./types";

type Row = {
  key: string;
  productStickerId: string;
  quantity: string;
  price: string;
};

function newRow(): Row {
  return { key: crypto.randomUUID(), productStickerId: "", quantity: "", price: "" };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function ReceiveTab({ onOpenCatalog }: { onOpenCatalog: () => void }) {
  const { user } = useDashboard();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");

  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [rows, setRows] = useState<Row[]>([newRow()]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const rowRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  async function loadRefs() {
    const supabase = createClient();
    const [supRes, matRes] = await Promise.all([
      supabase.from("suppliers").select("id, name, contact_phone, contact_email").order("name"),
      supabase
        .from("product_stickers")
        .select("id, product_name, material_type, unit, default_vase_life_days, order_unit_size")
        .eq("category", "ohapka")
        .order("product_name"),
    ]);
    setSuppliers(supRes.data ?? []);
    setMaterials(matRes.data ?? []);
    // Единственный поставщик — почти наверняка тот, что нужен; не
    // заставляем лишний раз кликать, чтобы его "выбрать".
    if (supRes.data?.length === 1) setSupplierId(supRes.data[0].id);
    setLoading(false);
  }

  useEffect(() => {
    loadRefs();
  }, []);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function addRowAndFocus() {
    const row = newRow();
    setRows((prev) => [...prev, row]);
    setTimeout(() => rowRefs.current[row.key]?.focus(), 0);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, row: Row, isLast: boolean) {
    if (e.key === "Enter" && isLast && row.productStickerId && parseFloat(row.quantity) > 0) {
      e.preventDefault();
      addRowAndFocus();
    }
  }

  async function createSupplier() {
    const name = newSupplierName.trim();
    if (!name) return;
    const supabase = createClient();
    const { data, error } = await supabase.from("suppliers").insert({ name }).select("id, name, contact_phone, contact_email").single();
    if (error) {
      setError(error.message);
      return;
    }
    setSuppliers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplierId(data.id);
    setAddingSupplier(false);
    setNewSupplierName("");
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  const validRows = rows.filter((r) => r.productStickerId && parseFloat(r.quantity) > 0);
  const canSubmit = !!supplierId && validRows.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit || !supplierId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const supabase = createClient();

    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("warehouse-photos").upload(path, photoFile);
        if (uploadErr) throw new Error(uploadErr.message);
        photoUrl = supabase.storage.from("warehouse-photos").getPublicUrl(path).data.publicUrl;
      }

      for (const row of validRows) {
        const material = materials.find((m) => m.id === row.productStickerId);
        const qty = parseFloat(row.quantity);
        const wiltDate =
          material?.default_vase_life_days != null
            ? new Date(new Date(purchaseDate).getTime() + material.default_vase_life_days * 86400000).toISOString().slice(0, 10)
            : null;

        const { data: batch, error: batchErr } = await supabase
          .from("batches")
          .insert({
            product_sticker_id: row.productStickerId,
            supplier_id: supplierId,
            quantity_received: qty,
            remaining: 0,
            purchase_price_per_unit: row.price ? parseFloat(row.price) : null,
            purchase_date: purchaseDate,
            estimated_wilt_date: wiltDate,
            photo_url: photoUrl,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (batchErr || !batch) throw new Error(batchErr?.message ?? "Не удалось создать партию");

        const { error: moveErr } = await supabase.from("stock_movements").insert({
          batch_id: batch.id,
          change_qty: qty,
          reason: "received",
          created_by: user.id,
        });
        if (moveErr) throw new Error(moveErr.message);
      }

      setSuccess(`Оприходовано позиций: ${validRows.length}`);
      setRows([newRow()]);
      setSupplierId(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      setPurchaseDate(todayStr());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Поставщик</p>
        <div className="flex flex-wrap gap-2">
          {suppliers.map((s) => (
            <button
              key={s.id}
              onClick={() => setSupplierId(s.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                supplierId === s.id
                  ? "bg-accent border-accent text-white"
                  : "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {s.name}
            </button>
          ))}
          {!addingSupplier ? (
            <button
              onClick={() => setAddingSupplier(true)}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium border border-dashed border-zinc-300 dark:border-zinc-600 text-accent hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              + Новый поставщик
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSupplier()}
                placeholder="Название"
                className="rounded-full border border-zinc-300 dark:border-zinc-600 bg-transparent px-3.5 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button onClick={createSupplier} className="text-sm font-medium text-accent">
                Добавить
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Дата поставки</label>
        <input
          type="date"
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
          className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Что привезли</p>
        <div className="space-y-2">
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            const material = materials.find((m) => m.id === row.productStickerId);
            return (
              <div key={row.key} className="flex items-center gap-2">
                <select
                  ref={(el) => {
                    rowRefs.current[row.key] = el;
                  }}
                  value={row.productStickerId}
                  onChange={(e) => updateRow(row.key, { productStickerId: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Что привезли…
                  </option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {decodeHtmlEntities(m.product_name)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  onKeyDown={(e) => handleRowKeyDown(e, row, isLast)}
                  placeholder="Кол-во"
                  className="w-24 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
                {material?.unit && <span className="w-14 shrink-0 text-xs text-zinc-400">{material.unit}</span>}
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={row.price}
                  onChange={(e) => updateRow(row.key, { price: e.target.value })}
                  onKeyDown={(e) => handleRowKeyDown(e, row, isLast)}
                  placeholder="Цена/ед."
                  className="w-24 rounded-md border border-zinc-300 dark:border-zinc-600 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  className="shrink-0 text-zinc-400 hover:text-red-500 disabled:opacity-30"
                  title="Удалить строку"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button onClick={addRowAndFocus} className="mt-2 text-sm font-medium text-accent">
          + Добавить позицию
        </button>
        <p className="mt-1 text-xs text-zinc-400">
          Enter в количестве или цене — сразу новая строка. Нет нужного цветка в списке?{" "}
          <button type="button" onClick={onOpenCatalog} className="text-accent underline">
            Добавь его в каталоге
          </button>{" "}
          — он сразу появится и здесь.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Фото при приёмке (необязательно)</p>
        {photoPreview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="" className="h-28 w-28 rounded-md object-cover border border-zinc-200 dark:border-zinc-700" />
            <button
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
              }}
              className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-zinc-900 text-xs text-white"
            >
              ✕
            </button>
          </div>
        ) : (
          <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-400 hover:border-accent hover:text-accent">
            <span className="text-2xl">📷</span>
            <span className="text-xs">Снять фото</span>
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          </label>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-md bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40 sm:w-auto sm:px-8"
      >
        {submitting ? "Сохраняем…" : "Оприходовать партию"}
      </button>
      {!canSubmit && !submitting && (
        <p className="text-xs text-zinc-400">
          {!supplierId ? "Выбери поставщика выше" : "Укажи хотя бы один цветок и количество"}
        </p>
      )}
    </div>
  );
}
