"use client";

import { useEffect, useState, use } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/client";
import { Card, Button, Field, Input, Alert, StatusBadge } from "@/components/ui";
import { fmtInt, fmtNum } from "@/lib/format";

interface Rec {
  id: string; recordDate: string; status: string;
  house: { code: string; name: string }; flock: { code: string; strain: { name: string } };
  age: { label: string };
  population: { openingPopulation: number; mortality: number; culling: number; transferIn: number; transferOut: number; closingPopulation: number };
  eggs: { wholeEggs: number; crackedEggs: number; brokenEggs: number; dirtyEggs: number; abnormalEggs: number; totalEggs: number; totalWeightKg: string | number };
  feed: { feedConsumedKg: string | number; pricePerKg: string | number | null } | null;
  recordedByUser: { fullName: string } | null;
}

export default function RecordingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [rec, setRec] = useState<Rec | null>(null);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ mortality: 0, culling: 0, whole: 0, cracked: 0, broken: 0, dirty: 0, abnormal: 0, weightKg: 0, consumed: 0 });

  async function load() {
    const res = await apiGet<Rec>(`/api/recordings/${id}`);
    if (res.ok) {
      setRec(res.data!);
      const r = res.data!;
      setForm({
        mortality: r.population.mortality, culling: r.population.culling,
        whole: r.eggs.wholeEggs, cracked: r.eggs.crackedEggs, broken: r.eggs.brokenEggs,
        dirty: r.eggs.dirtyEggs, abnormal: r.eggs.abnormalEggs, weightKg: Number(r.eggs.totalWeightKg),
        consumed: r.feed ? Number(r.feed.feedConsumedKg) : 0,
      });
    } else setMsg({ kind: "error", text: res.error?.message ?? "Gagal memuat" });
  }
  useEffect(() => { load(); }, [id]);

  async function saveCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) { setMsg({ kind: "error", text: "Alasan koreksi wajib diisi" }); return; }
    setBusy(true); setMsg(null);
    const res = await apiPatch(`/api/recordings/${id}`, {
      reason,
      population: { openingPopulation: rec!.population.openingPopulation, mortality: form.mortality, culling: form.culling, transferIn: rec!.population.transferIn, transferOut: rec!.population.transferOut },
      eggs: { wholeEggs: form.whole, crackedEggs: form.cracked, brokenEggs: form.broken, dirtyEggs: form.dirty, abnormalEggs: form.abnormal, totalWeightKg: form.weightKg },
      feed: { feedConsumedKg: form.consumed },
    });
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: "Koreksi tersimpan & indikator dihitung ulang" });
    setEditing(false); setReason(""); load();
  }

  async function verify() {
    setBusy(true); setMsg(null);
    const res = await apiPost(`/api/recordings/${id}/verify`, {});
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: "Recording diverifikasi" }); load();
  }

  if (!rec) return <p className="text-gray-500">{msg ? msg.text : "Memuat…"}</p>;

  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              Recording {rec.recordDate?.slice(0, 10)} <StatusBadge status={rec.status} />
            </h1>
            <p className="text-sm text-gray-500">Kandang {rec.house.code} · {rec.flock.code} · {rec.flock.strain.name} · Umur {rec.age.label} · Pencatat {rec.recordedByUser?.fullName ?? "—"}</p>
          </div>
          <div className="flex gap-2">
            {rec.status !== "LOCKED" && <Button variant="outline" onClick={() => setEditing((s) => !s)}>{editing ? "Batal" : "Koreksi"}</Button>}
            {(rec.status === "SUBMITTED" || rec.status === "DRAFT") && <Button onClick={verify} disabled={busy}>Verifikasi</Button>}
          </div>
        </div>
        {rec.status === "LOCKED" && <p className="text-xs text-amber-600 mt-2">Recording terkunci — hanya Super Admin yang dapat membuka & mengoreksi.</p>}
      </Card>

      {!editing ? (
        <div className="grid md:grid-cols-3 gap-4">
          <Card title="Populasi">
            <dl className="text-sm space-y-1">
              <Row2 k="Awal" v={fmtInt(rec.population.openingPopulation)} />
              <Row2 k="Mati" v={fmtInt(rec.population.mortality)} />
              <Row2 k="Afkir" v={fmtInt(rec.population.culling)} />
              <Row2 k="Akhir" v={fmtInt(rec.population.closingPopulation)} />
            </dl>
          </Card>
          <Card title="Telur">
            <dl className="text-sm space-y-1">
              <Row2 k="Utuh" v={fmtInt(rec.eggs.wholeEggs)} />
              <Row2 k="Retak/Pecah/Kotor/Abn" v={`${rec.eggs.crackedEggs}/${rec.eggs.brokenEggs}/${rec.eggs.dirtyEggs}/${rec.eggs.abnormalEggs}`} />
              <Row2 k="Total" v={fmtInt(rec.eggs.totalEggs)} />
              <Row2 k="Berat (kg)" v={fmtNum(Number(rec.eggs.totalWeightKg))} />
            </dl>
          </Card>
          <Card title="Pakan">
            <dl className="text-sm space-y-1">
              <Row2 k="Konsumsi (kg)" v={fmtNum(rec.feed ? Number(rec.feed.feedConsumedKg) : null)} />
              <Row2 k="Harga/kg" v={fmtNum(rec.feed?.pricePerKg != null ? Number(rec.feed.pricePerKg) : null, 0)} />
            </dl>
          </Card>
        </div>
      ) : (
        <Card title="Koreksi Recording">
          <form onSubmit={saveCorrection} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Mati"><Input type="number" value={form.mortality} onChange={(e) => setForm({ ...form, mortality: Number(e.target.value) || 0 })} /></Field>
              <Field label="Afkir"><Input type="number" value={form.culling} onChange={(e) => setForm({ ...form, culling: Number(e.target.value) || 0 })} /></Field>
              <Field label="Telur utuh"><Input type="number" value={form.whole} onChange={(e) => setForm({ ...form, whole: Number(e.target.value) || 0 })} /></Field>
              <Field label="Retak"><Input type="number" value={form.cracked} onChange={(e) => setForm({ ...form, cracked: Number(e.target.value) || 0 })} /></Field>
              <Field label="Pecah"><Input type="number" value={form.broken} onChange={(e) => setForm({ ...form, broken: Number(e.target.value) || 0 })} /></Field>
              <Field label="Kotor"><Input type="number" value={form.dirty} onChange={(e) => setForm({ ...form, dirty: Number(e.target.value) || 0 })} /></Field>
              <Field label="Abnormal"><Input type="number" value={form.abnormal} onChange={(e) => setForm({ ...form, abnormal: Number(e.target.value) || 0 })} /></Field>
              <Field label="Berat total (kg)"><Input type="number" step="0.01" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) || 0 })} /></Field>
              <Field label="Pakan konsumsi (kg)"><Input type="number" step="0.01" value={form.consumed} onChange={(e) => setForm({ ...form, consumed: Number(e.target.value) || 0 })} /></Field>
            </div>
            <Field label="Alasan koreksi (wajib, tersimpan di audit trail)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input jumlah telur" required />
            </Field>
            <p className="text-xs text-gray-400">Populasi hari-hari berikutnya akan dihitung ulang otomatis (opening = closing hari sebelumnya).</p>
            <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Koreksi"}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}

function Row2({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-gray-500">{k}</dt><dd className="font-medium">{v}</dd></div>;
}
