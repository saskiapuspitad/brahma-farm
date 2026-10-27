"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { closingPopulation } from "@/domain/indicators/population";
import { computeDailyIndicators } from "@/domain/indicators/formulas";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { addToOutbox, saveDraft, loadDraft, clearDraft } from "@/lib/offline";

interface ActiveFlock {
  id: string; code: string; houseId: string; ageLabel: string;
  house: { code: string; name: string }; strain: { name: string };
}
interface Prefill {
  flock: { id: string; code: string; strain: string };
  house: { id: string; code: string; name: string };
  ageDays: number; ageWeek: number; ageLabel: string;
  openingPopulation: number;
  defaults: { feedTypeId: string | null; openingStockKg: number; pricePerKg: number | null };
  targetForAge: { hdpTarget: number | null; fcrTarget: number | null } | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function RecordingNewPage() {
  // Satu kandang bisa berisi beberapa flock aktif (mis. A1 & A2), jadi recording dipilih per flock.
  const [flocks, setFlocks] = useState<ActiveFlock[]>([]);
  const [flockId, setFlockId] = useState("");
  const [doneFlockIds, setDoneFlockIds] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(todayStr());
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Field form
  const [pop, setPop] = useState({ opening: 0, mortality: 0, culling: 0, transferIn: 0, transferOut: 0 });
  const [eggs, setEggs] = useState({ whole: 0, cracked: 0, broken: 0, dirty: 0, abnormal: 0, weightKg: 0 });
  const [feed, setFeed] = useState({ given: 0, leftover: 0, consumed: 0, pricePerKg: 0 });

  useEffect(() => {
    fetch("/api/flocks?status=ACTIVE").then((r) => r.json()).then((j) => {
      if (!j.success) return;
      const sorted = [...(j.data as ActiveFlock[])].sort((a, b) =>
        a.house.code.localeCompare(b.house.code, "id", { numeric: true }) ||
        a.code.localeCompare(b.code, "id", { numeric: true }));
      setFlocks(sorted);
    });
  }, []);

  // Tandai flock yang sudah direcord pada tanggal terpilih.
  async function loadDone(d: string) {
    const j = await fetch(`/api/recordings?from=${d}&to=${d}&pageSize=100`).then((r) => r.json()).catch(() => null);
    if (j?.success) setDoneFlockIds(new Set((j.data as { flockId: string }[]).map((r) => r.flockId)));
  }
  useEffect(() => { if (date) loadDone(date); }, [date]);

  // Kelompokkan flock per kandang untuk dropdown.
  const byHouse = useMemo(() => {
    const m = new Map<string, { label: string; items: ActiveFlock[] }>();
    for (const f of flocks) {
      const g = m.get(f.houseId) ?? { label: `${f.house.code} — ${f.house.name}`, items: [] };
      g.items.push(f);
      m.set(f.houseId, g);
    }
    return [...m.values()];
  }, [flocks]);

  useEffect(() => {
    if (!flockId || !date) return;
    setMsg(null);
    fetch(`/api/recordings/prefill?flockId=${flockId}&date=${date}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setPrefill(j.data);
          setPop((p) => ({ ...p, opening: j.data.openingPopulation }));
          setFeed((f) => ({ ...f, pricePerKg: j.data.defaults.pricePerKg ?? 0 }));
        } else {
          setPrefill(null); setMsg(j.error?.message ?? "Flock tidak dapat dimuat");
        }
      });
  }, [flockId, date]);

  const totalEggs = eggs.whole + eggs.cracked + eggs.broken + eggs.dirty + eggs.abnormal;
  const consumed = feed.consumed > 0 ? feed.consumed : Math.max(0, feed.given - feed.leftover);
  const closing = closingPopulation({
    openingPopulation: pop.opening, mortality: pop.mortality, culling: pop.culling,
    transferIn: pop.transferIn, transferOut: pop.transferOut,
  });

  const ind = useMemo(() => computeDailyIndicators({
    openingPopulation: pop.opening, closingPopulation: closing,
    initialPopulation: prefill ? pop.opening : pop.opening, // HHP pakai populasi awal flock di server; preview pakai opening
    mortality: pop.mortality, totalEggs,
    crackedEggs: eggs.cracked, dirtyEggs: eggs.dirty,
    totalWeightKg: eggs.weightKg, feedConsumedKg: consumed,
    pricePerKg: feed.pricePerKg || null, basis: "OPENING",
  }), [pop, eggs, feed, closing, totalEggs, consumed, prefill]);

  // Autosave draft per flock+tanggal (untuk pemulihan bila halaman tertutup).
  // Autosave baru aktif setelah draft untuk kunci ini dipulihkan, supaya draft lama tidak tertimpa nilai kosong.
  const draftKey = `flock:${flockId}:${date}`;
  const restoredKey = useRef<string | null>(null);
  useEffect(() => {
    if (!flockId || !date || restoredKey.current !== draftKey) return;
    saveDraft(draftKey, { pop, eggs, feed });
  }, [draftKey, flockId, date, pop, eggs, feed]);

  // Pulihkan draft saat ganti flock/tanggal.
  useEffect(() => {
    if (!flockId || !date) return;
    const d = loadDraft<{ pop: typeof pop; eggs: typeof eggs; feed: typeof feed }>(draftKey);
    if (d) { setPop(d.pop); setEggs(d.eggs); setFeed(d.feed); }
    restoredKey.current = draftKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flockId, date]);

  function resetForm() {
    setPop({ opening: 0, mortality: 0, culling: 0, transferIn: 0, transferOut: 0 });
    setEggs({ whole: 0, cracked: 0, broken: 0, dirty: 0, abnormal: 0, weightKg: 0 });
    setFeed({ given: 0, leftover: 0, consumed: 0, pricePerKg: 0 });
  }

  function selectFlock(id: string) {
    resetForm();
    setPrefill(null);
    setFlockId(id);
  }

  /** Lanjut ke flock berikutnya yang belum direcord (bisa di kandang yang sama, mis. A1 → A2). */
  function advance(justSavedId: string) {
    const done = new Set(doneFlockIds).add(justSavedId);
    const idx = flocks.findIndex((f) => f.id === justSavedId);
    const next = [...flocks.slice(idx + 1), ...flocks.slice(0, idx)].find((f) => !done.has(f.id));
    if (next) selectFlock(next.id);
    else setMsg((m) => (m ? m + " Semua flock aktif sudah direcord untuk tanggal ini." : m));
  }

  async function save(next: boolean) {
    if (!prefill) return;
    setSaving(true); setMsg(null);
    const body = {
      houseId: prefill.house.id, flockId: prefill.flock.id, recordDate: date,
      population: { openingPopulation: pop.opening, mortality: pop.mortality, culling: pop.culling, transferIn: pop.transferIn, transferOut: pop.transferOut },
      eggs: { wholeEggs: eggs.whole, crackedEggs: eggs.cracked, brokenEggs: eggs.broken, dirtyEggs: eggs.dirty, abnormalEggs: eggs.abnormal, totalWeightKg: eggs.weightKg },
      feed: { feedGivenKg: feed.given, feedLeftoverKg: feed.leftover, feedConsumedKg: consumed, pricePerKg: feed.pricePerKg || undefined },
    };
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
      const res = await fetch("/api/recordings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) { setMsg("⚠ " + (j.error?.message ?? "Gagal menyimpan")); return; }
      setMsg(`✓ Recording ${prefill.flock.code} tersimpan. Populasi akhir ${fmtInt(j.data.closingPopulation)}.`);
      clearDraft(draftKey);
      setDoneFlockIds((s) => new Set(s).add(prefill.flock.id));
      if (next) advance(prefill.flock.id);
    } catch {
      // Offline / jaringan gagal → simpan ke outbox untuk sinkron otomatis nanti.
      addToOutbox(body);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("brahmafarm:outbox"));
      setMsg(`📴 Offline — recording ${prefill.flock.code} disimpan lokal & akan dikirim otomatis saat online.`);
      clearDraft(draftKey);
      if (next) advance(prefill.flock.id);
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Input Recording Harian</h1>

      <div className="bg-white rounded-xl border p-4 grid md:grid-cols-3 gap-3">
        <Field label="Tanggal">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </Field>
        <Field label="Kandang / Flock">
          <select value={flockId} onChange={(e) => selectFlock(e.target.value)} className="w-full border rounded-lg px-3 py-2">
            <option value="">— pilih flock —</option>
            {byHouse.map((g) => (
              <optgroup key={g.label} label={`Kandang ${g.label}`}>
                {g.items.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.ageLabel}{doneFlockIds.has(f.id) ? " ✓ sudah" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {flocks.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {flocks.filter((f) => doneFlockIds.has(f.id)).length} dari {flocks.length} flock aktif sudah direcord
            </p>
          )}
        </Field>
        <div className="text-sm flex items-end">
          {prefill ? (
            <div>
              <div className="font-medium">{prefill.flock.code} · {prefill.flock.strain}</div>
              <div className="text-gray-500">Kandang {prefill.house.code} · Umur {prefill.ageLabel} ({prefill.ageDays} hari)</div>
            </div>
          ) : <span className="text-gray-400">Pilih flock untuk memuat data</span>}
        </div>
      </div>

      {msg && <div className="text-sm bg-brand-50 border border-brand-100 rounded p-2">{msg}</div>}

      {prefill && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <Section title="Populasi">
              <Num label="Populasi awal (otomatis)" value={pop.opening} onChange={(v) => setPop({ ...pop, opening: v })} />
              <Num label="Mati" value={pop.mortality} onChange={(v) => setPop({ ...pop, mortality: v })} />
              <Num label="Afkir" value={pop.culling} onChange={(v) => setPop({ ...pop, culling: v })} />
              <Num label="Transfer masuk" value={pop.transferIn} onChange={(v) => setPop({ ...pop, transferIn: v })} />
              <Num label="Transfer keluar" value={pop.transferOut} onChange={(v) => setPop({ ...pop, transferOut: v })} />
              <ReadOnly label="Populasi akhir" value={fmtInt(closing)} />
            </Section>

            <Section title="Telur (butir)">
              <Num label="Utuh" value={eggs.whole} onChange={(v) => setEggs({ ...eggs, whole: v })} />
              <Num label="Retak" value={eggs.cracked} onChange={(v) => setEggs({ ...eggs, cracked: v })} />
              <Num label="Pecah" value={eggs.broken} onChange={(v) => setEggs({ ...eggs, broken: v })} />
              <Num label="Kotor" value={eggs.dirty} onChange={(v) => setEggs({ ...eggs, dirty: v })} />
              <Num label="Abnormal" value={eggs.abnormal} onChange={(v) => setEggs({ ...eggs, abnormal: v })} />
              <ReadOnly label="Total telur" value={fmtInt(totalEggs)} />
              <Num label="Berat total (kg)" value={eggs.weightKg} step="0.01" onChange={(v) => setEggs({ ...eggs, weightKg: v })} />
            </Section>

            <Section title="Pakan (kg)">
              <Num label="Diberikan" value={feed.given} step="0.01" onChange={(v) => setFeed({ ...feed, given: v })} />
              <Num label="Sisa" value={feed.leftover} step="0.01" onChange={(v) => setFeed({ ...feed, leftover: v })} />
              <ReadOnly label="Konsumsi" value={fmtNum(consumed)} />
              <Num label="Harga/kg" value={feed.pricePerKg} step="1" onChange={(v) => setFeed({ ...feed, pricePerKg: v })} />
            </Section>
          </div>

          <div className="space-y-2">
            <div className="bg-white rounded-xl border p-4 sticky top-4">
              <h2 className="font-semibold mb-2">Indikator (langsung)</h2>
              <Ind label="Populasi akhir" value={fmtInt(closing)} />
              <Ind label="HDP" value={fmtPct(ind.hdpPct)} target={prefill.targetForAge?.hdpTarget != null ? `target ${fmtPct(prefill.targetForAge.hdpTarget)}` : undefined} />
              <Ind label="Egg mass/ekor" value={`${fmtNum(ind.eggMassG)} g`} />
              <Ind label="Pakan/ekor" value={`${fmtNum(ind.feedIntakeG)} g`} />
              <Ind label="FCR" value={fmtNum(ind.fcr)} target={prefill.targetForAge?.fcrTarget != null ? `target ${fmtNum(prefill.targetForAge.fcrTarget)}` : undefined} />
              <Ind label="Berat telur rata²" value={`${fmtNum(ind.avgEggWeightG)} g`} />
              <Ind label="Mortalitas" value={fmtPct(ind.mortalityPct)} />
              <p className="text-xs text-gray-400 mt-2">HHP dihitung server memakai populasi awal flock.</p>
            </div>
          </div>
        </div>
      )}

      {prefill && (
        <div className="flex gap-2">
          <button onClick={() => save(false)} disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-60">
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
          <button onClick={() => save(true)} disabled={saving}
            className="border border-brand-600 text-brand-700 rounded-lg px-4 py-2 font-medium">
            Simpan &amp; lanjut flock berikutnya →
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium mb-1">{label}</label>{children}</div>;
}
function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input type="number" inputMode="numeric" step={step ?? "1"} value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full border rounded-lg px-2 py-1.5" />
    </div>
  );
}
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <div className="w-full border rounded-lg px-2 py-1.5 bg-gray-50 font-medium">{value}</div>
    </div>
  );
}
function Ind({ label, value, target }: { label: string; value: string; target?: string }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b last:border-0 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold">{value}{target && <span className="ml-1 text-xs text-amber-600 font-normal">({target})</span>}</span>
    </div>
  );
}
