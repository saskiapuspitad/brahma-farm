"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Field, Input, Select, Alert, StatusBadge } from "@/components/ui";
import { fmtInt } from "@/lib/format";

interface Flock {
  id: string; code: string; status: string; initialPopulation: number;
  ageLabel: string; ageWeek: number;
  strain: { name: string }; house: { code: string; name: string };
}
interface House { id: string; code: string; name: string; status: string; farmId: string }
interface Strain { id: string; name: string }
interface Farm { id: string; code: string; name: string }

export default function FlocksPage() {
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [strains, setStrains] = useState<Strain[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [form, setForm] = useState({
    farmId: "", houseId: "", code: "", strainId: "", hatchDate: "", entryDate: "",
    initialPopulation: "", productionPhase: "PRE_LAY", activate: true,
  });

  async function load() {
    const [fl, h, s, fa] = await Promise.all([
      apiGet<Flock[]>("/api/flocks"), apiGet<House[]>("/api/houses"),
      apiGet<Strain[]>("/api/strains"), apiGet<Farm[]>("/api/farms"),
    ]);
    if (fl.ok) setFlocks(fl.data!);
    if (h.ok) setHouses(h.data!);
    if (s.ok) { setStrains(s.data!); }
    if (fa.ok) { setFarms(fa.data!); if (fa.data![0]) setForm((x) => ({ ...x, farmId: x.farmId || fa.data![0].id })); }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await apiPost("/api/flocks", {
      farmId: form.farmId, houseId: form.houseId, code: form.code, strainId: form.strainId,
      hatchDate: form.hatchDate, entryDate: form.entryDate,
      initialPopulation: Number(form.initialPopulation), productionPhase: form.productionPhase,
      activate: form.activate,
    });
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal membuat flock" }); return; }
    setMsg({ kind: "success", text: "Flock dibuat" });
    setShowForm(false);
    load();
  }

  const farmHouses = houses.filter((h) => h.farmId === form.farmId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Flock</h1>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Tutup" : "+ Tambah Flock"}</Button>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {showForm && (
        <Card title="Tambah Flock">
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <Field label="Peternakan">
              <Select value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value, houseId: "" })} required>
                {farms.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
              </Select>
            </Field>
            <Field label="Kandang">
              <Select value={form.houseId} onChange={(e) => setForm({ ...form, houseId: e.target.value })} required>
                <option value="">— pilih —</option>
                {farmHouses.map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name} ({h.status})</option>)}
              </Select>
            </Field>
            <Field label="Kode flock"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="FLK-2026-02" /></Field>
            <Field label="Strain">
              <Select value={form.strainId} onChange={(e) => setForm({ ...form, strainId: e.target.value })} required>
                <option value="">— pilih —</option>
                {strains.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal menetas"><Input type="date" value={form.hatchDate} onChange={(e) => setForm({ ...form, hatchDate: e.target.value })} required /></Field>
            <Field label="Tanggal masuk"><Input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required /></Field>
            <Field label="Populasi awal"><Input type="number" value={form.initialPopulation} onChange={(e) => setForm({ ...form, initialPopulation: e.target.value })} required /></Field>
            <Field label="Fase produksi">
              <Select value={form.productionPhase} onChange={(e) => setForm({ ...form, productionPhase: e.target.value })}>
                <option value="PRE_LAY">Pra-produksi</option><option value="EARLY_LAY">Awal produksi</option>
                <option value="PEAK">Puncak</option><option value="LATE_LAY">Akhir produksi</option><option value="SPENT">Afkir</option>
              </Select>
            </Field>
            <label className="flex items-end gap-2 text-sm">
              <input type="checkbox" checked={form.activate} onChange={(e) => setForm({ ...form, activate: e.target.checked })} />
              Langsung aktifkan di kandang
            </label>
            <div className="flex items-end"><Button type="submit">Simpan</Button></div>
          </form>
          <p className="text-xs text-gray-400 mt-2">Aktivasi ditolak bila kandang sudah punya flock aktif — histori flock lama tetap tersimpan.</p>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr><th className="py-2">Kode</th><th>Kandang</th><th>Strain</th><th>Umur</th><th>Populasi awal</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {flocks.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{f.code}</td>
                  <td>{f.house.code}</td>
                  <td>{f.strain.name}</td>
                  <td>{f.ageLabel}</td>
                  <td>{fmtInt(f.initialPopulation)}</td>
                  <td><StatusBadge status={f.status} /></td>
                  <td><Link href={`/flocks/${f.id}`} className="text-brand-700 hover:underline">Detail →</Link></td>
                </tr>
              ))}
              {flocks.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400">Belum ada flock.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
