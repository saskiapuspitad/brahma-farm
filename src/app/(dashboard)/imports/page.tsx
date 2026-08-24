"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Alert } from "@/components/ui";

interface RowResult { row: number; status: "ok" | "error"; errors?: string[] }
interface ImportResult { totalRows: number; validRows: number; invalidRows: number; results: RowResult[]; committed?: number }
interface History { id: string; importType: string; fileName: string | null; totalRows: number; successRows: number; failedRows: number; status: string; createdAt: string; user: { fullName: string } | null }

export default function ImportsPage() {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<History[]>([]);

  async function loadHistory() {
    const res = await apiGet<History[]>("/api/imports/history");
    if (res.ok) setHistory(res.data!);
  }
  useEffect(() => { loadHistory(); }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
    setPreview(null); setMsg(null);
  }

  async function doPreview() {
    setBusy(true); setMsg(null); setPreview(null);
    const res = await apiPost<ImportResult>("/api/imports/recording", { csv, commit: false });
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setPreview(res.data!);
    setMsg({ kind: res.data!.invalidRows ? "info" : "success", text: `Pratinjau: ${res.data!.validRows} valid, ${res.data!.invalidRows} bermasalah dari ${res.data!.totalRows} baris.` });
  }

  async function doCommit() {
    setBusy(true); setMsg(null);
    const res = await apiPost<ImportResult>("/api/imports/recording", { csv, commit: true });
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: `${res.data!.committed ?? 0} recording tersimpan. ${res.data!.invalidRows} baris dilewati.` });
    setPreview(res.data!); setCsv(""); loadHistory();
  }

  const errorRows = preview?.results.filter((r) => r.status === "error") ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Impor Data Massal</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title="Impor Recording Lama (CSV)">
        <ol className="text-sm text-gray-600 list-decimal ml-5 mb-3 space-y-1">
          <li>Unduh template, isi sesuai kolom (kode farm/kandang/flock harus sudah ada di sistem).</li>
          <li>Unggah file → <b>Pratinjau</b> untuk validasi & cek duplikat.</li>
          <li>Perbaiki baris bermasalah bila ada, lalu <b>Simpan</b> untuk komit hanya baris valid.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <a href="/api/imports/recording/template"><Button variant="outline">Unduh Template</Button></a>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        </div>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6}
          className="w-full border rounded-lg px-3 py-2 font-mono text-xs" placeholder="Tempel isi CSV di sini atau unggah file di atas…" />
        <div className="flex gap-2 mt-2">
          <Button onClick={doPreview} disabled={!csv.trim() || busy}>Pratinjau</Button>
          <Button onClick={doCommit} disabled={!preview || preview.validRows === 0 || busy}>Simpan ({preview?.validRows ?? 0} valid)</Button>
        </div>
      </Card>

      {preview && (
        <Card title={`Hasil Validasi — ${preview.validRows} valid / ${preview.invalidRows} bermasalah`}>
          {errorRows.length === 0 ? (
            <p className="text-sm text-green-700">Semua baris valid. Siap disimpan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 border-b"><tr><th className="py-2 w-20">Baris</th><th>Masalah</th></tr></thead>
                <tbody>
                  {errorRows.map((r) => (
                    <tr key={r.row} className="border-b last:border-0">
                      <td className="py-2 text-red-600 font-medium">{r.row}</td>
                      <td className="text-red-600">{r.errors?.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card title="Riwayat Impor">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b"><tr><th className="py-2">Waktu</th><th>Jenis</th><th>File</th><th>Total</th><th>Berhasil</th><th>Gagal</th><th>Status</th><th>Oleh</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-2">{h.createdAt?.slice(0, 16).replace("T", " ")}</td>
                  <td>{h.importType}</td><td>{h.fileName}</td><td>{h.totalRows}</td>
                  <td className="text-green-700">{h.successRows}</td><td className="text-red-600">{h.failedRows}</td>
                  <td>{h.status}</td><td>{h.user?.fullName ?? "—"}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-gray-400">Belum ada impor.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
