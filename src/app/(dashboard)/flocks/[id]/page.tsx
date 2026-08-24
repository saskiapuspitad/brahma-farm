"use client";

import { useEffect, useState, use } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Alert, StatusBadge } from "@/components/ui";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";

interface Summary { ageWeek: number | null; hdpPct: string | number | null; fcr: string | number | null }
interface Detail {
  flock: {
    id: string; code: string; status: string; initialPopulation: number;
    hatchDate: string; entryDate: string; sourceSupplier: string | null;
    strain: { name: string }; house: { code: string; name: string };
    assignments: { id: string; startDate: string; endDate: string | null; flock: { code: string } }[];
    summaries: Summary[];
  };
  age: { label: string; days: number; weeks: number };
  cycle: {
    totalEggs: number | null; hdpPct: string | number | null; fcr: string | number | null;
    cumMortalityPct: string | number | null; depletionPct: string | number | null;
    feedConsumedKg: string | number | null; feedCost: string | number | null;
  } | null;
  treatmentCount: number;
}

const n = (v: string | number | null | undefined) => (v == null ? null : Number(v));

export default function FlockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await apiGet<Detail>(`/api/flocks/${id}`);
    if (res.ok) setD(res.data!);
    else setMsg({ kind: "error", text: res.error?.message ?? "Gagal memuat" });
  }
  useEffect(() => { load(); }, [id]);

  async function activate() {
    setBusy(true); setMsg(null);
    const res = await apiPost(`/api/flocks/${id}/activate`, {});
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: "Flock diaktifkan" }); load();
  }
  async function complete(status: "COMPLETED" | "CULLED") {
    setBusy(true); setMsg(null);
    const res = await apiPost(`/api/flocks/${id}/complete`, { status });
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: status === "COMPLETED" ? "Flock diselesaikan" : "Flock diafkir" }); load();
  }

  if (!d) return <p className="text-gray-500">{msg ? msg.text : "Memuat…"}</p>;
  const f = d.flock;
  const chart = f.summaries
    .filter((s) => s.ageWeek != null)
    .map((s) => ({ ageWeek: s.ageWeek, hdp: n(s.hdpPct), fcr: n(s.fcr) }));

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">{f.code} <StatusBadge status={f.status} /></h1>
            <p className="text-sm text-gray-500">
              {f.strain.name} · Kandang {f.house.code} · Umur {d.age.label} ({d.age.days} hari) · Awal {fmtInt(f.initialPopulation)} ekor
            </p>
            <p className="text-xs text-gray-400">Menetas {f.hatchDate?.slice(0, 10)} · Masuk {f.entryDate?.slice(0, 10)} · Supplier {f.sourceSupplier ?? "—"} · Perlakuan tercatat: {d.treatmentCount}</p>
          </div>
          <div className="flex gap-2">
            {f.status === "PREPARATION" && <Button onClick={activate} disabled={busy}>Aktifkan</Button>}
            {f.status === "ACTIVE" && <>
              <Button variant="outline" onClick={() => complete("COMPLETED")} disabled={busy}>Selesaikan</Button>
              <Button variant="danger" onClick={() => complete("CULLED")} disabled={busy}>Afkir</Button>
            </>}
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Ringkasan Siklus">
          {d.cycle ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Total telur" value={fmtInt(d.cycle.totalEggs)} />
              <Stat label="HDP kumulatif" value={fmtPct(n(d.cycle.hdpPct))} />
              <Stat label="FCR kumulatif" value={fmtNum(n(d.cycle.fcr))} />
              <Stat label="Mortalitas kumulatif" value={fmtPct(n(d.cycle.cumMortalityPct))} />
              <Stat label="Deplesi" value={fmtPct(n(d.cycle.depletionPct))} />
              <Stat label="Pakan (kg)" value={fmtNum(n(d.cycle.feedConsumedKg), 1)} />
            </div>
          ) : <p className="text-sm text-gray-500">Belum ada recording untuk siklus ini.</p>}
        </Card>

        <Card title="HDP & FCR vs Umur">
          {chart.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ageWeek" /><YAxis yAxisId="l" /><YAxis yAxisId="r" orientation="right" />
                <Tooltip /><Legend />
                <Line yAxisId="l" type="monotone" dataKey="hdp" name="HDP %" stroke="#2f9e5b" dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="fcr" name="FCR" stroke="#c0562f" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-500">Belum ada data grafik.</p>}
          <p className="text-xs text-gray-400 mt-1">Marker perlakuan menyusul; perbandingan bersifat deskriptif, bukan sebab-akibat.</p>
        </Card>
      </div>

      <Card title="Riwayat Penempatan Kandang">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b"><tr><th className="py-2">Mulai</th><th>Selesai</th><th>Status</th></tr></thead>
            <tbody>
              {f.assignments.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">{a.startDate?.slice(0, 10)}</td>
                  <td>{a.endDate ? a.endDate.slice(0, 10) : "— (aktif)"}</td>
                  <td>{a.endDate ? "Selesai" : "Berjalan"}</td>
                </tr>
              ))}
              {f.assignments.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-gray-400">Belum ada penempatan.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-gray-500">{label}</div><div className="font-semibold">{value}</div></div>;
}
