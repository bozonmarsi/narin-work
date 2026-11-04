"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "../warehouse/Modal";
import {
  cardToForm,
  emptyCardForm,
  formToPayload,
  validateCardForm,
  type CardForm,
  type CardRow,
  type CardSection,
} from "./productCardForm";

const inputClass =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-sky-500";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-zinc-400">{hint}</span>}
    </label>
  );
}

// Редактор карточки товара на сайте (попап в каталоге). Строка в product_cards
// появляется при первом сохранении.
export function ProductCardEditor({
  product,
  onClose,
}: {
  product: { id: string; name: string; category: string | null };
  onClose: () => void;
}) {
  const [form, setForm] = useState<CardForm>(emptyCardForm());
  const [existing, setExisting] = useState<CardRow | null>(null);
  const [linked, setLinked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStabilized = product.category === "stabilizovane";
  const isFlower = !isStabilized && product.category !== "atelier" && product.category !== "darky";

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("product_cards").select("*").eq("product_id", product.id).maybeSingle(),
      supabase.from("product_stickers").select("tilda_uid").eq("id", product.id).maybeSingle(),
    ]).then(([card, sticker]) => {
      if (card.error) {
        setError(card.error.message);
      } else if (card.data) {
        const row = card.data as CardRow;
        setExisting(row);
        setForm(cardToForm(row));
      }
      setLinked(!!sticker.data?.tilda_uid);
      setLoading(false);
    });
  }, [product.id]);

  function set<K extends keyof CardForm>(key: K, value: CardForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function addPhoto(file: File) {
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${product.id}-card-${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("product-stickers").upload(path, file);
    if (uploadErr) {
      setError(uploadErr.message);
    } else {
      const { data } = supabase.storage.from("product-stickers").getPublicUrl(path);
      setForm((f) => ({ ...f, extraImages: [...f.extraImages, data.publicUrl] }));
    }
    setUploading(false);
  }

  async function save() {
    const problem = validateCardForm(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const sections = (existing?.extra_sections ?? null) as CardSection[] | null;
    const payload = {
      ...formToPayload(form, sections),
      source: "owner",
      // По updated_at попап на сайте понимает, что кэш карточек устарел.
      updated_at: new Date().toISOString(),
    };
    const status = form.visible ? "ready" : "draft";
    const result = existing
      ? // status только если изменился: на него завязан пересчёт всех рекомендаций.
        await supabase
          .from("product_cards")
          .update(existing.status === status ? payload : { ...payload, status })
          .eq("product_id", product.id)
      : await supabase.from("product_cards").insert({ product_id: product.id, status, ...payload });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onClose();
  }

  return (
    <Modal title={`Карточка на сайте — ${product.name}`} onClose={onClose} wide>
      {loading ? (
        <p className="text-sm text-zinc-400">Загрузка…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Тексты показываются покупателям как есть, пишите по-чешски. На сайте изменения появятся в течение 30 минут.
            Пустое поле на сайте просто не показывается.
          </p>
          {!linked && (
            <p className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              Товар ещё не связан с Tilda: заполнить можно, но на сайте карточка появится после того, как название
              совпадёт с товаром в Tilda и пройдёт синхронизация каталога.
            </p>
          )}
          {isStabilized && (
            <p className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
              Общие советы и уход для стабилизированных цветов подставятся сами. Заполняйте их здесь, только если для
              этого товара нужны свои.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.visible}
              onChange={(e) => set("visible", e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            Показывать эту карточку на сайте
          </label>

          <Field label="Описание">
            <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
          </Field>

          <Field label="Высота" hint="Например: 50–65 cm. Больше 65 см — появится заметка, что может приехать без коробки">
            <input value={form.height} onChange={(e) => set("height", e.target.value)} className={inputClass} />
          </Field>

          {isStabilized && (
            <Field label="Сколько простоит" hint="Коротко, например: 2–3 roky. Пусто — будет «dlouhé měsíce»">
              <input value={form.vaseNote} onChange={(e) => set("vaseNote", e.target.value)} className={inputClass} />
            </Field>
          )}

          {isFlower && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="В вазе, от (дней)">
                  <input inputMode="numeric" value={form.vaseMin} onChange={(e) => set("vaseMin", e.target.value)} className={inputClass} />
                </Field>
                <Field label="В вазе, до (дней)">
                  <input inputMode="numeric" value={form.vaseMax} onChange={(e) => set("vaseMax", e.target.value)} className={inputClass} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Вода" hint="Например: 1/3 délky stonku">
                  <input value={form.water} onChange={(e) => set("water", e.target.value)} className={inputClass} />
                </Field>
                <Field label="Срез" hint="Например: Rovný nebo mírně šikmý řez">
                  <input value={form.cut} onChange={(e) => set("cut", e.target.value)} className={inputClass} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Аромат, текст" hint="Например: Jemná">
                  <input value={form.scentText} onChange={(e) => set("scentText", e.target.value)} className={inputClass} />
                </Field>
                <Field label="Аромат, сила">
                  <select value={form.scentLevel} onChange={(e) => set("scentLevel", e.target.value)} className={inputClass}>
                    <option value="">не указано</option>
                    <option value="0">0 — нет</option>
                    <option value="1">1 — лёгкий</option>
                    <option value="2">2 — средний</option>
                    <option value="3">3 — сильный</option>
                  </select>
                </Field>
              </div>
              <Field label="Питомцы, кратко" hint="Лучше осторожная формулировка, чем неверное «нетоксично»">
                <input value={form.petText} onChange={(e) => set("petText", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Питомцы, подробнее">
                <input value={form.petNote} onChange={(e) => set("petNote", e.target.value)} className={inputClass} />
              </Field>
            </>
          )}

          <Field label="Важная заметка" hint="Серая строка под советами">
            <input value={form.importantNote} onChange={(e) => set("importantNote", e.target.value)} className={inputClass} />
          </Field>

          <Field label="Důležité vědět" hint="Каждый совет с новой строки: Заголовок — текст. Пусто — общие советы для этого цветка">
            <textarea rows={3} value={form.highlights} onChange={(e) => set("highlights", e.target.value)} className={inputClass} />
          </Field>

          <Field label="Jak o ni pečovat" hint="Каждый шаг с новой строки">
            <textarea rows={4} value={form.care} onChange={(e) => set("care", e.target.value)} className={inputClass} />
          </Field>

          <Field label="Složení" hint="Каждая позиция с новой строки, например: 10 ks zeleného hyperica">
            <textarea rows={3} value={form.composition} onChange={(e) => set("composition", e.target.value)} className={inputClass} />
          </Field>

          <div className="space-y-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Дополнительные фото</span>
            <span className="block text-[11px] text-zinc-400">
              Показываются после фото из Tilda. Главное фото меняется в самой Tilda.
            </span>
            <div className="flex flex-wrap gap-2">
              {(existing?.images ?? []).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" title="Фото из Tilda" className="h-16 w-16 rounded-lg object-cover opacity-70" />
              ))}
              {form.extraImages.map((url) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => set("extraImages", form.extraImages.filter((u) => u !== url))}
                    className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-zinc-800 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-lg text-zinc-400">
                {uploading ? "…" : "+"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) addPhoto(file);
                  }}
                />
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Отмена
            </button>
            <button
              onClick={save}
              disabled={saving || uploading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
