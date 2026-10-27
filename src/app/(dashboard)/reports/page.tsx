"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client";
import { Card, Button, Field, Select, Input } from "@/components/ui";

const TYPES = [
  { key: "daily", label: "Produksi harian" },
  { key: "flock", label: "Rekap per flock" },
  { key: "treatments", label: "Riwayat perlakuan" },
  { key: "mortality", label: "Mortalitas & afkir" },
  { key: "incomplete", label: "Data belum lengkap" },
];

interface Flock { id: string; code: string }

export default function ReportsPage() {
  const [type, setType] = useState("daily");
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [filter, setFilter] = useState({ flockId: "", from: "", to: "" });
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { apiGet<Flock[]>("/api/flocks").then((r) => r.ok && setFlocks(r.data!)); }, []);

  function query() {
    const q = new URLSearchParams();
    if (filter.flockId) q.set("flockId", filter.flockId);
    if (filter.from) q.set("from", filter.from);
    if (filter.to) q.set("to", filter.to);
    return q.toString();
  }

  async function run() {
    setLoading(true);
    const res = await apiGet<Record<string, unknown>[]>(`/api/reports/${type}?${query()}`);
    setLoading(false);
    if (res.ok) setRows(res.data!);
  }
  useEffect(() => { run(); /* eslint-disable-next-line */ }, [type]);

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Laporan & Ekspor</h1>
        <Link href="/reports/flock" className="text-sm text-brand-700 hover:underline">Lihat grafik per flock →</Link>
      </div>

      <Card>
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <Field label="Jenis laporan">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Flock">
            <Select value={filter.flockId} onChange={(e) => setFilter({ ...filter, flockId: e.target.value })}>
              <option value="">Semua</option>
              {flocks.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </Select>
          </Field>
          <Field label="Dari"><Input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></Field>
          <Field label="Sampai"><Input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={run}>Tampilkan</Button>
            <a href={`/api/reports/${type}?format=xlsx&${query()}`}><Button variant="outline">Excel</Button></a>
            <a href={`/api/reports/${type}?format=pdf&${query()}`}><Button variant="outline">PDF</Button></a>
            <a href={`/api/reports/${type}?format=csv&${query()}`}><Button variant="outline">CSV</Button></a>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Ekspor Excel (.xlsx) & PDF native memuat identitas peternakan, periode, petugas, dan waktu pembuatan.</p>
      </Card>

      <Card title={`Hasil (${rows.length} baris)`}>
        {loading ? <p className="text-gray-500 text-sm">Memuat…</p> : rows.length === 0 ? (
          <p className="text-sm text-gray-400">Tidak ada data untuk filter ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-gray-500 border-b">
                <tr>{headers.map((h) => <th key={h} className="py-2 pr-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {headers.map((h) => <td key={h} className="py-1 pr-3 whitespace-nowrap">{r[h] == null ? "—" : String(r[h])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
