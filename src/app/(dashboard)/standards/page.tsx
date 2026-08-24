"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Field, Select, Alert } from "@/components/ui";
import { fmtNum, fmtPct } from "@/lib/format";

interface Standard {
  id: string; ageWeek: number; hdpTarget: string | number | null; fcrTarget: string | number | null;
  feedIntakeTargetG: string | number | null; eggWeightTargetG: string | number | null;
  maxMortalityPct: string | number | null; sourceLabel: string | null;
  strain: { name: string; code: string };
}
interface Strain { id: string; name: string; code: string }
const n = (v: string | number | null) => (v == null ? null : Number(v));

const TEMPLATE = "strain_code,age_week,hdp_target,feed_intake_target_g,egg_weight_target_g,egg_mass_target_g,fcr_target,body_weight_target_g,max_mortality_pct,source_label\nISA_BROWN,30,93.0,112,62.5,58.1,1.93,1950,0.05,Manual ISA Brown 2020";

export default function StandardsPage() {
  const [rows, setRows] = useState<Standard[]>([]);
  const [strains, setStrains] = useState<Strain[]>([]);
  const [strainId, setStrainId] = useState("");
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);

  async function load() {
    const q = strainId ? `?strainId=${strainId}` : "";
    const res = await apiGet<Standard[]>(`/api/standards${q}`);
    if (res.ok) setRows(res.data!);
  }
  useEffect(() => { apiGet<Strain[]>("/api/strains").then((r) => r.ok && setStrains(r.data!)); }, []);
  useEffect(() => { load(); }, [strainId]);

  async function importCsv() {
    setMsg(null);
    const res = await apiPost<{ totalRows: number; successRows: number; failedRows: number; errors: { row: number; message: string }[] }>("/api/standards/import", { csv });
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    const d = res.data!;
    setMsg({ kind: d.failedRows ? "info" : "success", text: `Impor selesai: ${d.successRows} berhasil, ${d.failedRows} gagal.` + (d.errors.length ? ` Contoh error baris ${d.errors[0].row}: ${d.errors[0].message}` : "") });
    setCsv(""); load();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    setCsv(await file.text());
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Standar Performa</h1>
      <Alert kind="info">Standar ini adalah acuan strain dari manual breeder (bukan data aktual). Wajib mencantumkan sumber.</Alert>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title="Impor CSV">
        <p className="text-xs text-gray-500 mb-2">Format kolom: <code className="text-xs">strain_code, age_week, hdp_target, feed_intake_target_g, egg_weight_target_g, egg_mass_target_g, fcr_target, body_weight_target_g, max_mortality_pct, source_label</code></p>
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm font-medium">Unggah file CSV:</label>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        </div>
        <p className="text-xs text-gray-400 mb-1">Atau tempel isi CSV di bawah ini:</p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5}
          className="w-full border rounded-lg px-3 py-2 font-mono text-xs" placeholder={TEMPLATE} />
        <div className="flex gap-2 mt-2">
          <Button onClick={importCsv} disabled={!csv.trim()}>Impor</Button>
          <Button variant="outline" onClick={() => setCsv(TEMPLATE)}>Isi contoh template</Button>
        </div>
      </Card>

      <Card title="Daftar Standar" action={
        <Field label="Filter strain">
          <Select value={strainId} onChange={(e) => setStrainId(e.target.value)}>
            <option value="">Semua</option>
            {strains.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr><th className="py-2">Strain</th><th>Umur (mgg)</th><th>HDP</th><th>Pakan (g)</th><th>Berat telur (g)</th><th>FCR</th><th>Maks mortalitas</th><th>Sumber</th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2">{s.strain.name}</td>
                  <td>{s.ageWeek}</td>
                  <td>{fmtPct(n(s.hdpTarget))}</td>
                  <td>{fmtNum(n(s.feedIntakeTargetG), 1)}</td>
                  <td>{fmtNum(n(s.eggWeightTargetG), 1)}</td>
                  <td>{fmtNum(n(s.fcrTarget))}</td>
                  <td>{fmtPct(n(s.maxMortalityPct))}</td>
                  <td className="text-xs text-gray-500">{s.sourceLabel}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-gray-400">Belum ada standar.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
