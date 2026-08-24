"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Field, Input, Select, Alert } from "@/components/ui";
import { fmtCurrency } from "@/lib/format";

interface Treatment {
  id: string; name: string; startDate: string; endDate: string | null; status: string;
  withdrawalUntil: string | null; dose: string | number | null; doseUnit: string | null;
  cost: string | number | null;
  category: { name: string }; flock: { code: string }; house: { code: string };
}
interface Cat { id: string; name: string }
interface Flock { id: string; code: string; farmId: string; houseId: string; house: { code: string } }

export default function TreatmentsPage() {
  const [rows, setRows] = useState<Treatment[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [form, setForm] = useState({
    flockId: "", categoryId: "", name: "", purpose: "", dose: "", doseUnit: "", route: "",
    startDate: "", endDate: "", withdrawalDays: "", cost: "",
  });

  async function load() {
    const [t, c, f] = await Promise.all([
      apiGet<Treatment[]>("/api/treatments"), apiGet<Cat[]>("/api/treatment-categories"),
      apiGet<Flock[]>("/api/flocks?status=ACTIVE"),
    ]);
    if (t.ok) setRows(t.data!);
    if (c.ok) setCats(c.data!);
    if (f.ok) setFlocks(f.data!);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const flock = flocks.find((x) => x.id === form.flockId);
    if (!flock) { setMsg({ kind: "error", text: "Pilih flock" }); return; }
    const res = await apiPost("/api/treatments", {
      farmId: flock.farmId, houseId: flock.houseId, flockId: flock.id, categoryId: form.categoryId,
      name: form.name, purpose: form.purpose || undefined,
      dose: form.dose ? Number(form.dose) : undefined, doseUnit: form.doseUnit || undefined, route: form.route || undefined,
      startDate: form.startDate, endDate: form.endDate || undefined,
      withdrawalDays: form.withdrawalDays ? Number(form.withdrawalDays) : undefined,
      cost: form.cost ? Number(form.cost) : undefined, status: "ONGOING",
    });
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: "Perlakuan dicatat" });
    setShow(false); load();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Perlakuan</h1>
        <div className="flex gap-2">
          <Link href="/treatments/timeline"><Button variant="outline">Timeline</Button></Link>
          <Button onClick={() => setShow((s) => !s)}>{show ? "Tutup" : "+ Catat Perlakuan"}</Button>
        </div>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {show && (
        <Card title="Catat Perlakuan">
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <Field label="Flock">
              <Select value={form.flockId} onChange={(e) => setForm({ ...form, flockId: e.target.value })} required>
                <option value="">— pilih —</option>
                {flocks.map((f) => <option key={f.id} value={f.id}>{f.code} ({f.house.code})</option>)}
              </Select>
            </Field>
            <Field label="Kategori">
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                <option value="">— pilih —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Nama/produk"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Tujuan"><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
            <Field label="Dosis"><Input type="number" step="0.001" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} /></Field>
            <Field label="Satuan dosis"><Input value={form.doseUnit} onChange={(e) => setForm({ ...form, doseUnit: e.target.value })} placeholder="ml/L, mg/kg" /></Field>
            <Field label="Cara pemberian"><Input value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} placeholder="air minum, injeksi" /></Field>
            <Field label="Tanggal mulai"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></Field>
            <Field label="Tanggal selesai"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
            <Field label="Masa henti obat (hari)"><Input type="number" value={form.withdrawalDays} onChange={(e) => setForm({ ...form, withdrawalDays: e.target.value })} /></Field>
            <Field label="Biaya"><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <div className="flex items-end"><Button type="submit">Simpan</Button></div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr><th className="py-2">Tanggal</th><th>Flock</th><th>Kategori</th><th>Nama</th><th>Dosis</th><th>Withdrawal</th><th>Biaya</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const active = t.withdrawalUntil && t.withdrawalUntil.slice(0, 10) >= today;
                return (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2">{t.startDate?.slice(0, 10)}</td>
                    <td>{t.flock.code}</td>
                    <td>{t.category.name}</td>
                    <td>{t.name}</td>
                    <td>{t.dose ? `${t.dose} ${t.doseUnit ?? ""}` : "—"}</td>
                    <td>{t.withdrawalUntil ? <span className={active ? "text-amber-600 font-medium" : "text-gray-500"}>s.d. {t.withdrawalUntil.slice(0, 10)}{active ? " ⚠" : ""}</span> : "—"}</td>
                    <td>{fmtCurrency(t.cost != null ? Number(t.cost) : null)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400">Belum ada perlakuan.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
