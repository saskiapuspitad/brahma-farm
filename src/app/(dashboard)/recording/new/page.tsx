"use client";

import { useEffect, useMemo, useState } from "react";
import { closingPopulation } from "@/domain/indicators/population";
import { computeDailyIndicators } from "@/domain/indicators/formulas";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { addToOutbox, saveDraft, loadDraft, clearDraft } from "@/lib/offline";

interface House { id: string; code: string; name: string; status: string }
interface Prefill {
  flock: { id: string; code: string; strain: string };
  ageDays: number; ageWeek: number; ageLabel: string;
  openingPopulation: number;
  defaults: { feedTypeId: string | null; openingStockKg: number; pricePerKg: number | null };
  targetForAge: { hdpTarget: number | null; fcrTarget: number | null } | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function RecordingNewPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Field form
  const [pop, setPop] = useState({ opening: 0, mortality: 0, culling: 0, transferIn: 0, transferOut: 0 });
  const [eggs, setEggs] = useState({ whole: 0, cracked: 0, broken: 0, dirty: 0, abnormal: 0, weightKg: 0 });
  const [feed, setFeed] = useState({ given: 0, leftover: 0, consumed: 0, pricePerKg: 0 });

  useEffect(() => {
    fetch("/api/houses?status=ACTIVE").then((r) => r.json()).then((j) => j.success && setHouses(j.data));
  }, []);

  useEffect(() => {
    if (!houseId || !date) return;
    setMsg(null);
    fetch(`/api/recordings/prefill?houseId=${houseId}&date=${date}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setPrefill(j.data);
          setPop((p) => ({ ...p, opening: j.data.openingPopulation }));
          setFeed((f) => ({ ...f, pricePerKg: j.data.defaults.pricePerKg ?? 0 }));
        } else {
          setPrefill(null); setMsg(j.error?.message ?? "Tidak ada flock aktif");
        }
      });
  }, [houseId, date]);

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

  // Autosave draft per kandang+tanggal (untuk pemulihan bila halaman tertutup).
  useEffect(() => {
    if (!houseId || !date) return;
    saveDraft(`${houseId}:${date}`, { pop, eggs, feed });
  }, [houseId, date, pop, eggs, feed]);

  // Pulihkan draft saat ganti kandang/tanggal.
  useEffect(() => {
    if (!houseId || !date) return;
    const d = loadDraft<{ pop: typeof pop; eggs: typeof eggs; feed: typeof feed }>(`${houseId}:${date}`);
    if (d) { setPop(d.pop); setEggs(d.eggs); setFeed(d.feed); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseId, date]);

  function advance() {
    setEggs({ whole: 0, cracked: 0, broken: 0, dirty: 0, abnormal: 0, weightKg: 0 });
    const idx = houses.findIndex((h) => h.id === houseId);
    const nextHouse = houses[idx + 1];
    if (nextHouse) setHouseId(nextHouse.id);
  }

  async function save(next: boolean) {
    if (!prefill) return;
    setSaving(true); setMsg(null);
    const body = {
      houseId, flockId: prefill.flock.id, recordDate: date,
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
      setMsg("✓ Recording tersimpan. Populasi akhir " + fmtInt(j.data.closingPopulation));
      clearDraft(`${houseId}:${date}`);
      if (next) advance();
    } catch {
      // Offline / jaringan gagal → simpan ke outbox untuk sinkron otomatis nanti.
      addToOutbox(body);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("brahmafarm:outbox"));
      setMsg("📴 Offline — recording disimpan lokal & akan dikirim otomatis saat online.");
      clearDraft(`${houseId}:${date}`);
      if (next) advance();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Input Recording Harian</h1>

      <div className="bg-white rounded-xl border p-4 grid md:grid-cols-3 gap-3">
        <Field label="Tanggal">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </Field>
        <Field label="Kandang">
          <select value={houseId} onChange={(e) => setHouseId(e.target.value)} className="w-full border rounded-lg px-3 py-2">
            <option value="">— pilih kandang —</option>
            {houses.map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
          </select>
        </Field>
        <div className="text-sm flex items-end">
          {prefill ? (
            <div>
              <div className="font-medium">{prefill.flock.code} · {prefill.flock.strain}</div>
              <div className="text-gray-500">Umur {prefill.ageLabel} ({prefill.ageDays} hari)</div>
            </div>
          ) : <span className="text-gray-400">Pilih kandang untuk memuat flock aktif</span>}
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
            Simpan &amp; lanjut kandang berikutnya →
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
