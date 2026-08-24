"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client";
import { Card, StatusBadge, Field, Input, Select } from "@/components/ui";
import { fmtInt } from "@/lib/format";

interface Row {
  id: string; recordDate: string; status: string;
  house: { code: string; name: string }; flock: { code: string };
  population: { openingPopulation: number; closingPopulation: number; mortality: number } | null;
  eggs: { totalEggs: number } | null;
}
interface House { id: string; code: string; name: string }

export default function RecordingHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [filter, setFilter] = useState({ houseId: "", from: "", to: "" });

  async function load() {
    const q = new URLSearchParams();
    if (filter.houseId) q.set("houseId", filter.houseId);
    if (filter.from) q.set("from", filter.from);
    if (filter.to) q.set("to", filter.to);
    const res = await apiGet<Row[]>(`/api/recordings?${q.toString()}`);
    if (res.ok) setRows(res.data!);
  }
  useEffect(() => { apiGet<House[]>("/api/houses").then((r) => r.ok && setHouses(r.data!)); }, []);
  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Riwayat Recording</h1>

      <Card>
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Kandang">
            <Select value={filter.houseId} onChange={(e) => setFilter({ ...filter, houseId: e.target.value })}>
              <option value="">Semua</option>
              {houses.map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
            </Select>
          </Field>
          <Field label="Dari"><Input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></Field>
          <Field label="Sampai"><Input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></Field>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr><th className="py-2">Tanggal</th><th>Kandang</th><th>Flock</th><th>Awal</th><th>Mati</th><th>Akhir</th><th>Telur</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{r.recordDate?.slice(0, 10)}</td>
                  <td>{r.house.code}</td>
                  <td>{r.flock.code}</td>
                  <td>{fmtInt(r.population?.openingPopulation ?? null)}</td>
                  <td>{fmtInt(r.population?.mortality ?? null)}</td>
                  <td>{fmtInt(r.population?.closingPopulation ?? null)}</td>
                  <td>{fmtInt(r.eggs?.totalEggs ?? null)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><Link href={`/recording/${r.id}`} className="text-brand-700 hover:underline">Detail →</Link></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="py-4 text-center text-gray-400">Belum ada recording.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
