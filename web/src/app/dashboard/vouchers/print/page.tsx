"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { useDashboard } from "../../layout";

type V = { code: string; batch: string | null };

const CLAIM_URL = "https://vezminarin.cz/poukaz?c=";
const PER_SHEET = 10; // 2 x 5 cards 85.6 x 54 mm on A4

// Печать карточек-сертификатов: A4, 10 карточек размера банковской карты на лист.
// Сумма на карточке не печатается: она ставится при включении (продаже).
export default function PrintVouchersPage() {
  const { profile } = useDashboard();
  const [vouchers, setVouchers] = useState<V[]>([]);
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState("all");
  const [qr, setQr] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("gift_vouchers")
        .select("code, batch")
        .eq("status", "inactive")
        .order("created_at", { ascending: false })
        .limit(500);
      const list = (data as V[]) ?? [];
      setVouchers(list);
      setBatch(list[0]?.batch ?? "all");
      setLoading(false);
    })();
  }, []);

  const batches = useMemo(() => {
    const m = new Map<string, number>();
    vouchers.forEach((v) => m.set(v.batch ?? "—", (m.get(v.batch ?? "—") ?? 0) + 1));
    return [...m.entries()];
  }, [vouchers]);

  const shown = useMemo(
    () => [...vouchers.filter((v) => batch === "all" || (v.batch ?? "—") === batch)].reverse(),
    [vouchers, batch],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const v of shown) {
        next[v.code] = await QRCode.toDataURL(CLAIM_URL + v.code, { errorCorrectionLevel: "M", margin: 0, width: 360 });
      }
      if (alive) setQr(next);
    })();
    return () => {
      alive = false;
    };
  }, [shown]);

  if (profile?.role !== "manager") {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Раздел доступен только менеджеру.</p>;
  }

  const sheets: V[][] = [];
  for (let i = 0; i < shown.length; i += PER_SHEET) sheets.push(shown.slice(i, i + PER_SHEET));

  return (
    <div className="space-y-4">
      <style>{`
        .vc-sheets { display: grid; gap: 16px; justify-content: center; }
        .vc-sheet { width: 210mm; min-height: 297mm; padding: 13.5mm 19.4mm; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.12); box-sizing: border-box; }
        .vc-grid { display: grid; grid-template-columns: repeat(2, 85.6mm); grid-auto-rows: 54mm; }
        .vc-cell { width: 85.6mm; height: 54mm; box-sizing: border-box; border: 0.2mm dashed #c9ced6; padding: 1.5mm; }
        .vcard { width: 100%; height: 100%; border-radius: 3.5mm; display: flex; color: #fff; overflow: hidden; position: relative;
          background: linear-gradient(135deg, #2a7bf0 0%, #186ce0 50%, #0f4fb0 100%); font-family: 'Rubik', Arial, sans-serif;
          -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .vcard::before { content: ''; position: absolute; width: 46mm; height: 46mm; right: -16mm; top: -22mm; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.28), rgba(255,255,255,0) 70%); }
        .vc-left { flex: 1; padding: 4.5mm 0 4mm 5mm; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
        .vc-logo { font-weight: 800; letter-spacing: .24em; font-size: 3.4mm; }
        .vc-title { font-weight: 700; font-size: 6.2mm; line-height: 1.1; }
        .vc-hint { font-size: 2.3mm; line-height: 1.35; color: #dbe8ff; max-width: 40mm; }
        .vc-right { width: 31mm; padding: 4.5mm 4.5mm 4mm 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; position: relative; }
        .vc-qr { background: #fff; border-radius: 2mm; padding: 1.6mm; width: 26mm; height: 26mm; box-sizing: border-box; }
        .vc-qr img { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
        .vc-code { font: 600 2.5mm/1 'Rubik', monospace; letter-spacing: .1em; white-space: nowrap; }
        @media print {
          @page { size: A4; margin: 0; }
          body * { visibility: hidden !important; }
          .vc-print, .vc-print * { visibility: visible !important; }
          .vc-print { position: absolute; left: 0; top: 0; width: 210mm; }
          .vc-noprint { display: none !important; }
          .vc-sheets { display: block; gap: 0; }
          .vc-sheet { box-shadow: none; page-break-after: always; break-after: page; }
        }
      `}</style>

      <div className="vc-noprint space-y-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/vouchers" className="text-sm text-accent">
            ← к сертификатам
          </Link>
        </div>
        <h1 className="text-xl font-semibold">Печать карточек</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Здесь не включённые сертификаты. Нажмите «Печать», в окне печати выберите A4, масштаб 100% и включите «Фоновая графика»
          (иначе синий фон не напечатается). Карточки размера банковской карты, по 10 на лист, пунктир это линия реза. QR ведёт
          на страницу, где клиент получает деньги на депозит. Сумма на карточке не печатается: вы ставите её при продаже.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
          >
            <option value="all">Все не включённые ({vouchers.length})</option>
            {batches.map(([b, n]) => (
              <option key={b} value={b}>
                Партия {b} ({n})
              </option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            disabled={shown.length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Печать ({shown.length} шт., {sheets.length} л.)
          </button>
        </div>
        {loading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Загрузка…</p>}
        {!loading && vouchers.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Не включённых сертификатов нет. Сначала создайте партию.</p>
        )}
      </div>

      <div className="vc-print overflow-x-auto">
        <div className="vc-sheets">
          {sheets.map((sheet, i) => (
            <div className="vc-sheet" key={i}>
              <div className="vc-grid">
                {sheet.map((v) => (
                  <div className="vc-cell" key={v.code}>
                    <div className="vcard">
                      <div className="vc-left">
                        <div className="vc-logo">NARIN</div>
                        <div className="vc-title">
                          Dárkový
                          <br />
                          poukaz
                        </div>
                        <div className="vc-hint">Naskenujte QR kód nebo zadejte kód na vezminarin.cz/poukaz</div>
                      </div>
                      <div className="vc-right">
                        <div className="vc-qr">{qr[v.code] ? <img src={qr[v.code]} alt="" /> : null}</div>
                        <div className="vc-code">{v.code}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
