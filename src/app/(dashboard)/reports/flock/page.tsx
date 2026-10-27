"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ComposedChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { apiGet } from "@/lib/client";
import { Card, Button, Field, Input, Select, Alert, StatusBadge } from "@/components/ui";
import { fmtCurrency, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import type { SeriesPoint, SeriesSummary } from "@/domain/reports/flock-series";

interface FlockOption { id: string; code: string; status: string; house: { code: string } }
interface ChartData {
  flock: {
    id: string; code: string; status: string; strain: string; house: { code: string; name: string };
    initialPopulation: number; hatchDate: string; entryDate: string; ageLabel: string;
  };
  grouping: "day" | "week";
  hasStandard: boolean;
  firstRecordDate: string | null;
  lastRecordDate: string | null;
  summary: SeriesSummary;
  points: SeriesPoint[];
}

type Range = "all" | "4w" | "12w" | "26w" | "custom";
const RANGES: { key: Range; label: string; weeks?: number }[] = [
  { key: "all", label: "Seluruh siklus" },
  { key: "4w", label: "4 minggu terakhir", weeks: 4 },
  { key: "12w", label: "12 minggu terakhir", weeks: 12 },
  { key: "26w", label: "26 minggu terakhir", weeks: 26 },
  { key: "custom", label: "Pilih tanggal" },
];

const C = {
  eggs: "#9fd3b4", hdp: "#2f9e5b", hhp: "#6b8fd6", target: "#9ca3af",
  whole: "#2f9e5b", cracked: "#e0a458", broken: "#d9534f", dirty: "#8d6e63", abnormal: "#9c7bd1",
  eggWeight: "#2f9e5b", eggMass: "#6b8fd6",
  feed: "#f2c48d", intake: "#c0562f", fcr: "#c0562f",
  mortality: "#d9534f", culling: "#f0ad4e", cum: "#7f1d1d", depletion: "#6b7280",
  population: "#3b82f6", cost: "#b7c9e8", costPerKg: "#1e3a8a",
  water: "#0ea5e9", temp: "#ef4444", humidity: "#14b8a6",
};

function minusDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function FlockChartsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-gray-500">Memuat…</p>}>
      <FlockChartsPage />
    </Suspense>
  );
}

function FlockChartsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [flocks, setFlocks] = useState<FlockOption[]>([]);
  const [flockId, setFlockId] = useState(params.get("flockId") ?? "");
  const [grouping, setGrouping] = useState<"day" | "week">((params.get("group") as "day" | "week") || "week");
  const [range, setRange] = useState<Range>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiGet<FlockOption[]>("/api/flocks").then((r) => {
      if (!r.ok) return;
      const sorted = [...r.data!].sort((a, b) =>
        a.house.code.localeCompare(b.house.code, "id", { numeric: true }) ||
        a.code.localeCompare(b.code, "id", { numeric: true }));
      setFlocks(sorted);
      if (!flockId) {
        const firstActive = sorted.find((f) => f.status === "ACTIVE") ?? sorted[0];
        if (firstActive) setFlockId(firstActive.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rentang tanggal dihitung dari recording terakhir flock (bukan hari ini), supaya flock yang sudah afkir tetap terbaca.
  const { from, to } = useMemo(() => {
    if (range === "custom") return { from: custom.from, to: custom.to };
    const weeks = RANGES.find((r) => r.key === range)?.weeks;
    if (!weeks || !lastDate) return { from: "", to: "" };
    return { from: minusDays(lastDate, weeks * 7 - 1), to: "" };
  }, [range, custom, lastDate]);

  useEffect(() => {
    if (!flockId) return;
    const q = new URLSearchParams({ flockId, group: grouping });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    setLoading(true); setErr(null);
    apiGet<ChartData>(`/api/reports/flock-charts?${q}`).then((r) => {
      setLoading(false);
      if (!r.ok) { setErr(r.error?.message ?? "Gagal memuat grafik"); setData(null); return; }
      setData(r.data!);
      if (r.data!.lastRecordDate) setLastDate(r.data!.lastRecordDate);
    });
    router.replace(`/reports/flock?flockId=${flockId}&group=${grouping}`, { scroll: false });
  }, [flockId, grouping, from, to, router]);

  function changeFlock(id: string) {
    setFlockId(id);
    setRange("all");
    setLastDate(null);
  }

  const pts = data?.points ?? [];
  const s = data?.summary;
  const hasCost = pts.some((p) => p.feedCost != null);
  const hasEnv = pts.some((p) => p.waterL != null || p.tempAvg != null || p.humidityPct != null);
  const hasEggs = pts.some((p) => p.totalEggs > 0);
  const unit = grouping === "week" ? "minggu" : "hari";
  const xInterval = pts.length > 40 ? Math.ceil(pts.length / 20) - 1 : 0;

  // Data datar untuk recharts (target dipisah ke kolom sendiri).
  const rows = useMemo(() => pts.map((p) => ({
    ...p,
    tHdp: p.target?.hdpPct ?? null,
    tFeed: p.target?.feedIntakeG ?? null,
    tEggW: p.target?.eggWeightG ?? null,
    tMass: p.target?.eggMassG ?? null,
    tFcr: p.target?.fcr ?? null,
    tMort: p.target?.maxCumMortalityPct ?? null,
  })), [pts]);

  const byHouse = useMemo(() => {
    const m = new Map<string, FlockOption[]>();
    for (const f of flocks) m.set(f.house.code, [...(m.get(f.house.code) ?? []), f]);
    return [...m.entries()];
  }, [flocks]);

  const dailyXlsx = data
    ? `/api/reports/daily?format=xlsx&flockId=${flockId}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
    : "#";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Grafik per Flock</h1>
          <p className="text-sm text-gray-500">Produksi telur, produktivitas, pakan, dan kematian per flock.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href="/reports"><Button variant="outline">Laporan tabel</Button></Link>
          {data && <a href={dailyXlsx}><Button variant="outline">Unduh Excel</Button></a>}
          {data && <Button variant="outline" onClick={() => window.print()}>Cetak</Button>}
        </div>
      </div>

      <Card>
        <div className="grid md:grid-cols-4 gap-3 items-end print:hidden">
          <Field label="Flock">
            <Select value={flockId} onChange={(e) => changeFlock(e.target.value)}>
              {flocks.length === 0 && <option value="">Memuat…</option>}
              {byHouse.map(([house, list]) => (
                <optgroup key={house} label={`Kandang ${house}`}>
                  {list.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code}{f.status === "COMPLETED" ? " (Selesai)" : f.status === "CULLED" ? " (Afkir)" : f.status === "PREPARATION" ? " (Persiapan)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Tampilan">
            <div className="flex rounded-lg border overflow-hidden" role="tablist">
              {(["week", "day"] as const).map((g) => (
                <button key={g} role="tab" aria-selected={grouping === g} onClick={() => setGrouping(g)}
                  className={`flex-1 px-3 py-2 text-sm ${grouping === g ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {g === "week" ? "Mingguan" : "Harian"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Rentang">
            <Select value={range} onChange={(e) => setRange(e.target.value as Range)}>
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
          {range === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Dari"><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
              <Field label="Sampai"><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
            </div>
          ) : <div />}
        </div>

        {data && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 mt-3 print:mt-0">
            <span className="font-semibold text-gray-900 text-base">{data.flock.code}</span>
            <StatusBadge status={data.flock.status} />
            <span>Kandang {data.flock.house.code}</span>
            <span>· {data.flock.strain}</span>
            <span>· Umur {data.flock.ageLabel}</span>
            <span>· Awal {fmtInt(data.flock.initialPopulation)} ekor</span>
            {s?.from && <span>· Data {s.from} s.d. {s.to} ({s.days} hari)</span>}
            <Link href={`/flocks/${data.flock.id}`} className="text-brand-700 hover:underline print:hidden">Detail flock →</Link>
          </div>
        )}
      </Card>

      {err && <Alert kind="error">{err}</Alert>}
      {loading && !data && <p className="text-gray-500 text-sm">Memuat grafik…</p>}

      {data && pts.length === 0 && (
        <Card><p className="text-sm text-gray-500 py-6 text-center">
          {data.firstRecordDate ? "Tidak ada recording pada rentang ini." : "Flock ini belum punya recording."}
        </p></Card>
      )}

      {data && s && pts.length > 0 && (
        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Kpi label="Total telur" value={fmtInt(s.totalEggs)} sub={`${fmtNum(s.eggWeightKg, 1)} kg`} />
            <Kpi label="HDP rata-rata" value={fmtPct(s.hdpPct, 1)} sub={`${fmtNum(s.henHousedEggs, 1)} butir/ekor awal`} />
            <Kpi label="Berat telur" value={`${fmtNum(s.avgEggWeightG, 1)} g`} sub={`Egg mass ${fmtNum(s.eggMassG, 1)} g/ekor/hr`} />
            <Kpi label="Pakan" value={`${fmtNum(s.feedKg, 0)} kg`} sub={`${fmtNum(s.feedIntakeG, 1)} g/ekor/hari`} />
            <Kpi label="FCR" value={fmtNum(s.fcr, 2)} sub={s.feedCost != null ? `Biaya ${fmtCurrency(s.feedCost)}` : "kg pakan / kg telur"} />
            <Kpi label="Kematian" value={`${fmtInt(s.mortality)} ekor`}
              sub={`Kumulatif ${fmtPct(s.cumMortalityPct, 2)} · afkir ${fmtInt(s.culling)}`}
              tone={s.mortality > 0 ? "warn" : undefined} />
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Ringkasan untuk rentang terpilih. Populasi terakhir {fmtInt(s.lastPopulation)} ekor · deplesi kumulatif {fmtPct(s.depletionPct, 2)}.
            {data.hasStandard ? " Garis putus-putus abu-abu = standar strain." : " Belum ada standar performa untuk strain ini (menu Standar Performa)."}
          </p>

          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="Produksi Telur & HDP" note={`Batang = jumlah telur per ${unit}; garis = HDP (% telur per ekor hidup) dan HHP (% per ekor awal).`}>
              <ComposedChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtInt(v)} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip content={<Tip grouping={grouping} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="totalEggs" name="Telur (butir)" fill={C.eggs} />
                <Line yAxisId="r" dataKey="hdpPct" name="HDP %" stroke={C.hdp} strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="r" dataKey="hhpPct" name="HHP %" stroke={C.hhp} dot={false} connectNulls />
                <Line yAxisId="r" dataKey="tHdp" name="Standar HDP" stroke={C.target} strokeDasharray="5 4" dot={false} connectNulls />
              </ComposedChart>
            </ChartCard>

            {hasEggs && (
              <ChartCard title="Kualitas Telur" note="Komposisi telur per kategori. Retak, pecah, dan kotor menurunkan nilai jual.">
                <ComposedChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtInt(v)} />
                  <Tooltip content={<Tip grouping={grouping} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="wholeEggs" name="Utuh" stackId="e" fill={C.whole} />
                  <Bar dataKey="crackedEggs" name="Retak" stackId="e" fill={C.cracked} />
                  <Bar dataKey="brokenEggs" name="Pecah" stackId="e" fill={C.broken} />
                  <Bar dataKey="dirtyEggs" name="Kotor" stackId="e" fill={C.dirty} />
                  <Bar dataKey="abnormalEggs" name="Abnormal" stackId="e" fill={C.abnormal} />
                </ComposedChart>
              </ChartCard>
            )}

            <ChartCard title="Berat Telur & Egg Mass" note="Berat rata-rata per butir dan egg mass (gram telur per ekor per hari).">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" g" domain={["auto", "auto"]} />
                <Tooltip content={<Tip grouping={grouping} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="avgEggWeightG" name="Berat telur (g)" stroke={C.eggWeight} strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="tEggW" name="Standar berat" stroke={C.eggWeight} strokeOpacity={0.45} strokeDasharray="5 4" dot={false} connectNulls />
                <Line dataKey="eggMassG" name="Egg mass (g/ekor)" stroke={C.eggMass} strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="tMass" name="Standar egg mass" stroke={C.eggMass} strokeOpacity={0.45} strokeDasharray="5 4" dot={false} connectNulls />
              </LineChart>
            </ChartCard>

            <ChartCard title="Konsumsi Pakan" note={`Batang = total pakan (kg) per ${unit}; garis = konsumsi per ekor per hari.`}>
              <ComposedChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtInt(v)} unit=" kg" />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit=" g" domain={["auto", "auto"]} />
                <Tooltip content={<Tip grouping={grouping} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="feedKg" name="Pakan (kg)" fill={C.feed} />
                <Line yAxisId="r" dataKey="feedIntakeG" name="g/ekor/hari" stroke={C.intake} strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="r" dataKey="tFeed" name="Standar pakan" stroke={C.target} strokeDasharray="5 4" dot={false} connectNulls />
              </ComposedChart>
            </ChartCard>

            <ChartCard title="FCR (Feed Conversion Ratio)" note="kg pakan per kg telur. Makin rendah makin efisien.">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) => fmtNum(v, 1)} />
                <Tooltip content={<Tip grouping={grouping} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="fcr" name="FCR" stroke={C.fcr} strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="tFcr" name="Standar FCR" stroke={C.target} strokeDasharray="5 4" dot={false} connectNulls />
              </LineChart>
            </ChartCard>

            <ChartCard title="Kematian & Afkir" note={`Batang = ekor mati/afkir per ${unit}; garis = mortalitas & deplesi kumulatif sejak awal siklus.`}>
              <ComposedChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} />
                <Tooltip content={<Tip grouping={grouping} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="mortality" name="Mati (ekor)" stackId="m" fill={C.mortality} />
                <Bar yAxisId="l" dataKey="culling" name="Afkir (ekor)" stackId="m" fill={C.culling} />
                <Line yAxisId="r" dataKey="cumMortalityPct" name="Mortalitas kum. %" stroke={C.cum} strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="r" dataKey="depletionPct" name="Deplesi kum. %" stroke={C.depletion} dot={false} connectNulls />
                <Line yAxisId="r" dataKey="tMort" name="Batas standar %" stroke={C.target} strokeDasharray="5 4" dot={false} connectNulls />
              </ComposedChart>
            </ChartCard>

            <ChartCard title="Populasi Hidup" note={`Jumlah ayam hidup di akhir tiap ${unit}.`}>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) => fmtInt(v)} />
                <Tooltip content={<Tip grouping={grouping} />} />
                <Line dataKey="closingPopulation" name="Populasi (ekor)" stroke={C.population} strokeWidth={2} dot={false} />
              </LineChart>
            </ChartCard>

            {hasCost && (
              <ChartCard title="Biaya Pakan" note="Batang = biaya pakan; garis = biaya pakan per kg telur.">
                <ComposedChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={(v) => `${fmtNum(v / 1000, 0)}rb`} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtInt(Math.round(v))} />
                  <Tooltip content={<Tip grouping={grouping} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="feedCost" name="Biaya pakan (Rp)" fill={C.cost} />
                  <Line yAxisId="r" dataKey="feedCostPerKgEgg" name="Rp / kg telur" stroke={C.costPerKg} strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </ChartCard>
            )}

            {hasEnv && (
              <ChartCard title="Air Minum & Lingkungan" note="Air per ekor per hari, suhu rata-rata, dan kelembapan.">
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" interval={xInterval} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} unit=" ml" domain={["auto", "auto"]} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip content={<Tip grouping={grouping} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="l" dataKey="waterPerHenMl" name="Air ml/ekor" stroke={C.water} strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="r" dataKey="tempAvg" name="Suhu °C" stroke={C.temp} dot={false} connectNulls />
                  <Line yAxisId="r" dataKey="humidityPct" name="Kelembapan %" stroke={C.humidity} dot={false} connectNulls />
                </LineChart>
              </ChartCard>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Nilai mingguan dihitung dari total minggu itu (mis. HDP = Σ telur ÷ Σ ekor-hari), bukan rata-rata persen harian.
            Perbandingan dengan standar bersifat deskriptif.
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-3 bg-white ${tone === "warn" ? "border-red-200" : ""}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactElement }) {
  return (
    <div className="bg-white rounded-xl border p-4 break-inside-avoid">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="text-xs text-gray-500 mb-2">{note}</p>}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

const FIELD_FMT: Record<string, (v: number) => string> = {
  totalEggs: (v) => `${fmtInt(v)} butir`, wholeEggs: fmtInt, crackedEggs: fmtInt, brokenEggs: fmtInt,
  dirtyEggs: fmtInt, abnormalEggs: fmtInt,
  hdpPct: (v) => fmtPct(v, 1), hhpPct: (v) => fmtPct(v, 1), tHdp: (v) => fmtPct(v, 1),
  avgEggWeightG: (v) => `${fmtNum(v, 1)} g`, tEggW: (v) => `${fmtNum(v, 1)} g`,
  eggMassG: (v) => `${fmtNum(v, 1)} g`, tMass: (v) => `${fmtNum(v, 1)} g`,
  feedKg: (v) => `${fmtNum(v, 1)} kg`, feedIntakeG: (v) => `${fmtNum(v, 1)} g`, tFeed: (v) => `${fmtNum(v, 1)} g`,
  fcr: (v) => fmtNum(v, 2), tFcr: (v) => fmtNum(v, 2),
  mortality: (v) => `${fmtInt(v)} ekor`, culling: (v) => `${fmtInt(v)} ekor`,
  cumMortalityPct: (v) => fmtPct(v, 2), depletionPct: (v) => fmtPct(v, 2), tMort: (v) => fmtPct(v, 2),
  closingPopulation: (v) => `${fmtInt(v)} ekor`,
  feedCost: fmtCurrency, feedCostPerKgEgg: fmtCurrency,
  waterPerHenMl: (v) => `${fmtNum(v, 0)} ml`, tempAvg: (v) => `${fmtNum(v, 1)} °C`, humidityPct: (v) => fmtPct(v, 0),
};

interface TipProps {
  active?: boolean;
  grouping: "day" | "week";
  payload?: { dataKey: string; name: string; value: number | null; color?: string; payload: SeriesPoint }[];
}

function Tip({ active, payload, grouping }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const head = grouping === "week"
    ? `Umur minggu ${p.ageWeek} · ${p.from.slice(8, 10)}/${p.from.slice(5, 7)}–${p.to.slice(8, 10)}/${p.to.slice(5, 7)} (${p.days} hari)`
    : `${p.from.split("-").reverse().join("/")} · umur minggu ${p.ageWeek}`;
  return (
    <div className="bg-white border rounded-lg shadow-sm px-3 py-2 text-xs">
      <div className="font-semibold mb-1">{head}</div>
      {payload.filter((x) => x.value != null).map((x) => (
        <div key={x.dataKey} className="flex justify-between gap-4">
          <span style={{ color: x.color }}>{x.name}</span>
          <span className="font-medium">{(FIELD_FMT[x.dataKey] ?? ((v: number) => fmtNum(v)))(x.value as number)}</span>
        </div>
      ))}
    </div>
  );
}
