"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Select, Field, Alert } from "@/components/ui";

interface AlertRow {
  id: string; alertType: string; severity: string; status: string; message: string;
  recordDate: string | null; house: { code: string } | null; flock: { code: string } | null;
}

const sevBadge = (s: string) =>
  s === "CRITICAL" ? "bg-red-100 text-red-700" : s === "WARNING" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700";
const statusLabel: Record<string, string> = { OPEN: "Terbuka", ACKNOWLEDGED: "Ditindaklanjuti", RESOLVED: "Selesai" };

export default function AlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [filter, setFilter] = useState({ status: "", severity: "" });
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const q = new URLSearchParams();
    if (filter.status) q.set("status", filter.status);
    if (filter.severity) q.set("severity", filter.severity);
    const res = await apiGet<AlertRow[]>(`/api/alerts?${q.toString()}`);
    if (res.ok) setRows(res.data!);
  }
  useEffect(() => { load(); }, [filter]);

  async function act(id: string, newStatus: string) {
    setMsg(null);
    const res = await apiPost(`/api/alerts/${id}/follow-up`, { newStatus });
    if (!res.ok) { setMsg(res.error?.message ?? "Gagal"); return; }
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pusat Peringatan</h1>
      {msg && <Alert kind="error">{msg}</Alert>}

      <Card>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Status">
            <Select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">Semua</option><option value="OPEN">Terbuka</option>
              <option value="ACKNOWLEDGED">Ditindaklanjuti</option><option value="RESOLVED">Selesai</option>
            </Select>
          </Field>
          <Field label="Tingkat">
            <Select value={filter.severity} onChange={(e) => setFilter({ ...filter, severity: e.target.value })}>
              <option value="">Semua</option><option value="CRITICAL">Kritis</option>
              <option value="WARNING">Waspada</option><option value="INFO">Info</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="space-y-2">
        {rows.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${sevBadge(a.severity)}`}>{a.severity}</span>
                <div>
                  <div className="text-sm font-medium">{a.message}</div>
                  <div className="text-xs text-gray-500">
                    {a.alertType} · {a.flock?.code ?? "—"} / {a.house?.code ?? "—"} · {a.recordDate?.slice(0, 10) ?? ""} · {statusLabel[a.status]}
                  </div>
                </div>
              </div>
              {a.status !== "RESOLVED" && (
                <div className="flex gap-2">
                  {a.status === "OPEN" && <Button variant="outline" onClick={() => act(a.id, "ACKNOWLEDGED")}>Tindak lanjuti</Button>}
                  <Button onClick={() => act(a.id, "RESOLVED")}>Selesai</Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {rows.length === 0 && <Card><p className="text-sm text-gray-400">Tidak ada peringatan.</p></Card>}
      </div>
    </div>
  );
}
