"use client";

import React, { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="bg-white rounded-xl border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Tutup">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full border rounded-lg px-3 py-2 text-sm ${props.className ?? ""}`} />;
}

function errText(e?: { message: string; details?: { field: string; message: string }[] }) {
  if (!e) return "Gagal";
  const extra = e.details?.map((d) => d.message).filter((m) => m !== e.message) ?? [];
  return [e.message, ...extra].join(" · ");
}

interface FlockRef { id: string; code: string }

/** Nonaktifkan flock: tutup siklus sebagai Selesai atau Afkir. */
export function DeactivateFlockDialog({ flock, onClose, onDone }: { flock: FlockRef; onClose: () => void; onDone: (msg: string) => void }) {
  const [status, setStatus] = useState<"COMPLETED" | "CULLED">("COMPLETED");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await apiPost(`/api/flocks/${flock.id}/complete`, { status, actualCullDate: date, reason });
    setBusy(false);
    if (!res.ok) { setErr(errText(res.error)); return; }
    onDone(`Flock ${flock.code} dinonaktifkan (${status === "COMPLETED" ? "Selesai" : "Afkir"})`);
  }

  return (
    <Modal title={`Nonaktifkan flock ${flock.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {err && <Alert kind="error">{err}</Alert>}
        <Field label="Jenis penonaktifan">
          <div className="grid grid-cols-2 gap-2">
            {([["COMPLETED", "Selesai", "Akhir siklus normal / dijual"], ["CULLED", "Afkir", "Diafkir lebih awal / masalah"]] as const).map(([v, l, d]) => (
              <label key={v} className={`border rounded-lg p-2 cursor-pointer text-sm ${status === v ? "border-brand-600 bg-brand-50" : ""}`}>
                <input type="radio" name="status" className="mr-2" checked={status === v} onChange={() => setStatus(v)} />
                <span className="font-medium">{l}</span>
                <span className="block text-xs text-gray-500 ml-5">{d}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Tanggal nonaktif">
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Alasan (wajib)">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3}
            placeholder="mis. Afkir umur 90 minggu, dijual ke pengepul" />
        </Field>
        <p className="text-xs text-gray-500">
          Flock tidak akan muncul lagi di Input Recording. Riwayat recording, perlakuan, dan laporan tetap tersimpan.
          Kandang menjadi Sanitasi bila tidak ada lagi flock aktif lain di dalamnya.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" variant="danger" disabled={busy}>{busy ? "Menyimpan…" : "Nonaktifkan"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Aktifkan kembali flock Selesai/Afkir (untuk koreksi). */
export function ReopenFlockDialog({ flock, onClose, onDone }: { flock: FlockRef; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await apiPost(`/api/flocks/${flock.id}/reopen`, { reason });
    setBusy(false);
    if (!res.ok) { setErr(errText(res.error)); return; }
    onDone(`Flock ${flock.code} diaktifkan kembali`);
  }

  return (
    <Modal title={`Aktifkan kembali ${flock.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {err && <Alert kind="error">{err}</Alert>}
        <p className="text-sm text-gray-600">
          Gunakan bila flock dinonaktifkan karena keliru. Flock kembali Aktif di kandangnya dan tanggal afkir dikosongkan.
        </p>
        <Field label="Alasan (wajib)">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3}
            placeholder="mis. Salah klik nonaktifkan" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Aktifkan kembali"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Hapus flock yang belum punya data (mis. salah input). */
export function DeleteFlockDialog({ flock, onClose, onDone }: { flock: FlockRef; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await apiDelete(`/api/flocks/${flock.id}`, { reason });
    setBusy(false);
    if (!res.ok) { setErr(errText(res.error)); return; }
    onDone(`Flock ${flock.code} dihapus`);
  }

  return (
    <Modal title={`Hapus flock ${flock.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {err && <Alert kind="error">{err}</Alert>}
        <p className="text-sm text-gray-600">
          Hapus hanya untuk flock yang salah input dan belum punya recording maupun perlakuan.
          Flock yang sudah berjalan sebaiknya dinonaktifkan agar datanya tetap tersimpan.
        </p>
        <Field label="Alasan (wajib)">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3}
            placeholder="mis. Duplikat input" />
        </Field>
        <Field label={`Ketik ${flock.code} untuk konfirmasi`}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" variant="danger" disabled={busy || confirm.trim() !== flock.code}>{busy ? "Menghapus…" : "Hapus"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export interface EditableFlock {
  id: string; code: string; strainId: string; sourceSupplier: string | null;
  hatchDate: string; entryDate: string; initialPopulation: number;
  productionPhase: string; plannedCullDate: string | null; notes: string | null;
}

/** Edit data flock. Tanggal & populasi awal dikunci bila sudah ada recording. */
export function EditFlockDialog({ flock, recordCount, onClose, onDone }: {
  flock: EditableFlock; recordCount: number; onClose: () => void; onDone: (msg: string) => void;
}) {
  const locked = recordCount > 0;
  const [strains, setStrains] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    code: flock.code, strainId: flock.strainId, sourceSupplier: flock.sourceSupplier ?? "",
    hatchDate: flock.hatchDate.slice(0, 10), entryDate: flock.entryDate.slice(0, 10),
    initialPopulation: String(flock.initialPopulation), productionPhase: flock.productionPhase,
    plannedCullDate: flock.plannedCullDate?.slice(0, 10) ?? "", notes: flock.notes ?? "", reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { apiGet<{ id: string; name: string }[]>("/api/strains").then((r) => r.ok && setStrains(r.data!)); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = {
      code: form.code.trim(), strainId: form.strainId, sourceSupplier: form.sourceSupplier,
      productionPhase: form.productionPhase, plannedCullDate: form.plannedCullDate || null,
      notes: form.notes, reason: form.reason || undefined,
    };
    if (!locked) {
      body.hatchDate = form.hatchDate;
      body.entryDate = form.entryDate;
      body.initialPopulation = Number(form.initialPopulation);
    }
    const res = await apiPatch(`/api/flocks/${flock.id}`, body);
    setBusy(false);
    if (!res.ok) { setErr(errText(res.error)); return; }
    onDone(`Flock ${form.code} diperbarui`);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={`Edit flock ${flock.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {err && <Alert kind="error">{err}</Alert>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Kode flock"><Input value={form.code} onChange={set("code")} required /></Field>
          <Field label="Strain">
            <Select value={form.strainId} onChange={set("strainId")} required>
              {strains.length === 0 && <option value={form.strainId}>Memuat…</option>}
              {strains.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Tanggal menetas"><Input type="date" value={form.hatchDate} onChange={set("hatchDate")} disabled={locked} required /></Field>
          <Field label="Tanggal masuk"><Input type="date" value={form.entryDate} onChange={set("entryDate")} disabled={locked} required /></Field>
          <Field label="Populasi awal"><Input type="number" min={0} value={form.initialPopulation} onChange={set("initialPopulation")} disabled={locked} required /></Field>
          <Field label="Fase produksi">
            <Select value={form.productionPhase} onChange={set("productionPhase")}>
              <option value="PRE_LAY">Pra-produksi</option><option value="EARLY_LAY">Awal produksi</option>
              <option value="PEAK">Puncak</option><option value="LATE_LAY">Akhir produksi</option><option value="SPENT">Afkir</option>
            </Select>
          </Field>
          <Field label="Supplier"><Input value={form.sourceSupplier} onChange={set("sourceSupplier")} /></Field>
          <Field label="Rencana afkir"><Input type="date" value={form.plannedCullDate} onChange={set("plannedCullDate")} /></Field>
        </div>
        {locked && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Tanggal menetas, tanggal masuk, dan populasi awal dikunci karena flock sudah punya {recordCount} recording
            (dipakai untuk menghitung umur, HDP, dan populasi).
          </p>
        )}
        <Field label="Catatan"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
        <Field label="Alasan perubahan (opsional, masuk audit log)"><Input value={form.reason} onChange={set("reason")} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
        </div>
      </form>
    </Modal>
  );
}
