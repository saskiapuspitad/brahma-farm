"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";

interface DashboardData {
  kpi: {
    activeHouses: number; activeFlocks: number; totalLivePopulation: number; eggsToday: number;
    avgHdp: number | null; avgFcr: number | null; avgFeedIntakeG: number | null; mortalityToday: number;
  };
  pendingRecordFlocks: { flockId: string; flockCode: string; houseId: string; houseCode: string }[];
  ongoingTreatments: number; withdrawalWarnings: number;
  alerts: { id: string; type: string; severity: string; message: string }[];
  charts: {
    hdpByAge: { ageWeek: number; value: number }[];
    fcrByAge: { ageWeek: number; value: number }[];
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((j) => { if (j.success) setData(j.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Memuat dashboard…</p>;
  if (!data) return <p className="text-gray-500">Belum ada data.</p>;

  const k = data.kpi;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Kandang aktif" value={fmtInt(k.activeHouses)} />
        <Kpi label="Flock aktif" value={fmtInt(k.activeFlocks)} />
        <Kpi label="Populasi hidup" value={fmtInt(k.totalLivePopulation)} suffix="ekor" />
        <Kpi label="Telur hari ini" value={fmtInt(k.eggsToday)} suffix="butir" />
        <Kpi label="HDP rata-rata" value={fmtPct(k.avgHdp)} />
        <Kpi label="FCR rata-rata" value={fmtNum(k.avgFcr)} />
        <Kpi label="Pakan/ekor" value={fmtNum(k.avgFeedIntakeG)} suffix="g" />
        <Kpi label="Mati hari ini" value={fmtInt(k.mortalityToday)} suffix="ekor" />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Info label="Flock belum input hari ini" value={`${data.pendingRecordFlocks.length}`}
          tone={data.pendingRecordFlocks.length ? "warn" : "ok"}
          detail={data.pendingRecordFlocks.map((f) => `${f.flockCode} (${f.houseCode})`).join(", ")} />
        <Info label="Perlakuan berjalan" value={`${data.ongoingTreatments}`} tone="neutral" />
        <Info label="Withdrawal aktif" value={`${data.withdrawalWarnings}`} tone={data.withdrawalWarnings ? "warn" : "ok"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="HDP vs Umur (minggu)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.charts.hdpByAge}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ageWeek" /><YAxis domain={[0, 100]} /><Tooltip /><Legend />
              <Line type="monotone" dataKey="value" name="HDP %" stroke="#2f9e5b" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="FCR vs Umur (minggu)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.charts.fcrByAge}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ageWeek" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="value" name="FCR" stroke="#c0562f" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <h2 className="font-semibold mb-2">Peringatan Terbaru</h2>
        {data.alerts.length === 0 ? (
          <p className="text-sm text-gray-500">Tidak ada peringatan terbuka.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex gap-2 items-center">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  a.severity === "CRITICAL" ? "bg-red-100 text-red-700" :
                  a.severity === "WARNING" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                  {a.severity}
                </span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="bg-white rounded-xl border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold">{value} {suffix && <span className="text-xs font-normal text-gray-400">{suffix}</span>}</div>
    </div>
  );
}

function Info({ label, value, tone, detail }: { label: string; value: string; tone: "ok" | "warn" | "neutral"; detail?: string }) {
  const cls = tone === "warn" ? "border-amber-300 bg-amber-50" : tone === "ok" ? "border-green-200 bg-green-50" : "border-gray-200 bg-white";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {detail && <div className="text-xs text-gray-600 mt-0.5">{detail}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border p-4"><h2 className="font-semibold mb-2">{title}</h2>{children}</div>;
}
