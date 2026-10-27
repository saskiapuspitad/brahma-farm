"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Field, Input, Select, Alert, StatusBadge } from "@/components/ui";
import { fmtInt } from "@/lib/format";

interface House {
  id: string; code: string; name: string; status: string; capacity: number | null;
  flocks: { id: string; code: string }[];
  responsibleUser: { fullName: string } | null;
}
interface Farm { id: string; code: string; name: string }

export default function HousesPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [form, setForm] = useState({ farmId: "", code: "", name: "", houseType: "BATTERY", capacity: "" });

  async function load() {
    const [h, f] = await Promise.all([apiGet<House[]>("/api/houses"), apiGet<Farm[]>("/api/farms")]);
    if (h.ok) setHouses(h.data!);
    if (f.ok) { setFarms(f.data!); if (f.data![0]) setForm((s) => ({ ...s, farmId: s.farmId || f.data![0].id })); }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await apiPost("/api/houses", {
      farmId: form.farmId, code: form.code, name: form.name, houseType: form.houseType,
      capacity: form.capacity ? Number(form.capacity) : undefined,
    });
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: "Kandang ditambahkan" });
    setForm({ ...form, code: "", name: "", capacity: "" });
    setShowForm(false);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kandang</h1>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Tutup" : "+ Tambah Kandang"}</Button>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {showForm && (
        <Card title="Tambah Kandang">
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <Field label="Peternakan">
              <Select value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value })} required>
                {farms.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
              </Select>
            </Field>
            <Field label="Kode"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="K-02" /></Field>
            <Field label="Nama"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Kandang 02" /></Field>
            <Field label="Jenis">
              <Select value={form.houseType} onChange={(e) => setForm({ ...form, houseType: e.target.value })}>
                <option value="BATTERY">Baterai</option><option value="POSTAL">Postal</option>
                <option value="CAGE_FREE">Cage-free</option><option value="OTHER">Lainnya</option>
              </Select>
            </Field>
            <Field label="Kapasitas (ekor)"><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
            <div className="flex items-end"><Button type="submit">Simpan</Button></div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr><th className="py-2">Kode</th><th>Nama</th><th>Status</th><th>Kapasitas</th><th>Flock aktif</th><th>Petugas</th></tr>
            </thead>
            <tbody>
              {houses.map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{h.code}</td>
                  <td>{h.name}</td>
                  <td><StatusBadge status={h.status} /></td>
                  <td>{fmtInt(h.capacity)}</td>
                  <td>
                    {h.flocks.length === 0 ? "—" : h.flocks.map((f, i) => (
                      <span key={f.id}>
                        {i > 0 && ", "}
                        <Link href={`/flocks/${f.id}`} className="text-brand-700 hover:underline">{f.code}</Link>
                      </span>
                    ))}
                  </td>
                  <td>{h.responsibleUser?.fullName ?? "—"}</td>
                </tr>
              ))}
              {houses.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">Belum ada kandang.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
