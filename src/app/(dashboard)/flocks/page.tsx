"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/client";
import { useMe } from "@/lib/use-me";
import { Card, Button, Field, Input, Select, Alert, StatusBadge } from "@/components/ui";
import { DeactivateFlockDialog } from "@/components/flock-dialogs";
import { fmtInt } from "@/lib/format";

interface Flock {
  id: string; code: string; status: string; initialPopulation: number;
  ageLabel: string; ageWeek: number; actualCullDate: string | null; houseId: string;
  strain: { name: string }; house: { code: string; name: string };
}
interface House { id: string; code: string; name: string; status: string; farmId: string }
interface Strain { id: string; name: string }
interface Farm { id: string; code: string; name: string }

type StatusFilter = "running" | "inactive" | "all";
const FILTERS: { key: StatusFilter; label: string; match: (s: string) => boolean }[] = [
  { key: "running", label: "Berjalan", match: (s) => s === "ACTIVE" || s === "PREPARATION" },
  { key: "inactive", label: "Nonaktif", match: (s) => s === "COMPLETED" || s === "CULLED" },
  { key: "all", label: "Semua", match: () => true },
];

export default function FlocksPage() {
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [strains, setStrains] = useState<Strain[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("running");
  const [deactivating, setDeactivating] = useState<Flock | null>(null);
  const { canManageFlocks } = useMe();
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
    if (fl.ok) {
      // Urut per kandang lalu kode flock (A1, A2, …) — satu kandang bisa berisi beberapa flock.
      setFlocks([...fl.data!].sort((a, b) =>
        a.house.code.localeCompare(b.house.code, "id", { numeric: true }) ||
        a.code.localeCompare(b.code, "id", { numeric: true })));
    }
    if (h.ok) setHouses(h.data!);
    if (s.ok) { setStrains(s.data!); }
    if (fa.ok) { setFarms(fa.data!); if (fa.data![0]) setForm((x) => ({ ...x, farmId: x.farmId || fa.data![0].id })); }
  }
  useEffect(() => { load(); }, []);

  // Pilih kandang → sarankan kode flock berikutnya (A1, A2 → A3). Tetap bisa diubah manual.
  const [codeTouched, setCodeTouched] = useState(false);
  async function chooseHouse(houseId: string) {
    setForm((x) => ({ ...x, houseId }));
    if (!houseId || codeTouched) return;
    const r = await apiGet<{ code: string }>(`/api/flocks/suggest-code?houseId=${houseId}`);
    if (r.ok) setForm((x) => (x.houseId === houseId ? { ...x, code: r.data!.code } : x));
  }

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
    setMsg({ kind: "success", text: `Flock ${form.code} dibuat` });
    setShowForm(false);
    setCodeTouched(false);
    setForm((x) => ({ ...x, houseId: "", code: "", hatchDate: "", entryDate: "", initialPopulation: "" }));
    load();
  }

  const farmHouses = houses.filter((h) => h.farmId === form.farmId);
  const activeFilter = FILTERS.find((x) => x.key === filter)!;
  const shown = flocks.filter((f) => activeFilter.match(f.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Flock</h1>
        {canManageFlocks && <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Tutup" : "+ Tambah Flock"}</Button>}
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {deactivating && (
        <DeactivateFlockDialog flock={deactivating} onClose={() => setDeactivating(null)}
          onDone={(text) => { setDeactivating(null); setMsg({ kind: "success", text }); load(); }} />
      )}

      {showForm && (
        <Card title="Tambah Flock">
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <Field label="Peternakan">
              <Select value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value, houseId: "" })} required>
                {farms.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
              </Select>
            </Field>
            <Field label="Kandang">
              <Select value={form.houseId} onChange={(e) => chooseHouse(e.target.value)} required>
                <option value="">— pilih —</option>
                {farmHouses.filter((h) => h.status !== "INACTIVE").map((h) => {
                  const n = flocks.filter((f) => f.houseId === h.id && f.status === "ACTIVE").length;
                  return <option key={h.id} value={h.id}>{h.code} — {h.name}{n ? ` (${n} flock aktif)` : ""}</option>;
                })}
              </Select>
            </Field>
            <Field label="Kode flock">
              <Input value={form.code} required placeholder="mis. A1, A2"
                onChange={(e) => { setCodeTouched(true); setForm({ ...form, code: e.target.value }); }} />
            </Field>
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
          <p className="text-xs text-gray-400 mt-2">
            Satu kandang boleh berisi beberapa flock dengan umur berbeda (mis. kandang A: A1, A2). Recording dicatat per flock.
          </p>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="Filter status flock">
          {FILTERS.map((x) => {
            const count = flocks.filter((f) => x.match(f.status)).length;
            const on = filter === x.key;
            return (
              <button key={x.key} role="tab" aria-selected={on} onClick={() => setFilter(x.key)}
                className={`px-3 py-1.5 rounded-lg text-sm ${on ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {x.label} <span className={on ? "opacity-80" : "text-gray-400"}>({count})</span>
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr><th className="py-2">Kandang</th><th>Flock</th><th>Strain</th><th>Umur</th><th>Populasi awal</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-2">{f.house.code}</td>
                  <td className="font-medium">{f.code}</td>
                  <td>{f.strain.name}</td>
                  <td>{f.ageLabel}</td>
                  <td>{fmtInt(f.initialPopulation)}</td>
                  <td>
                    <StatusBadge status={f.status} />
                    {f.actualCullDate && <span className="block text-xs text-gray-400 mt-0.5">sejak {f.actualCullDate.slice(0, 10)}</span>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {canManageFlocks && f.status === "ACTIVE" && (
                      <button onClick={() => setDeactivating(f)} className="text-red-600 hover:underline mr-4">Nonaktifkan</button>
                    )}
                    <Link href={`/flocks/${f.id}`} className="text-brand-700 hover:underline">Detail →</Link>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-gray-400">
                  {flocks.length === 0 ? "Belum ada flock." : `Tidak ada flock dengan status ${activeFilter.label.toLowerCase()}.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
