"use client";

import { useEffect, useState } from "react";
import { apiGet, api } from "@/lib/client";
import { Card, Button, Field, Select, Input, Alert } from "@/components/ui";

interface Setting { id: string; key: string; value: unknown; description: string | null }

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [basis, setBasis] = useState("OPENING");
  const [hdpLabel, setHdpLabel] = useState("HDP (Hen-Day Production)");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function load() {
    const res = await apiGet<Setting[]>("/api/settings");
    if (res.ok) {
      setSettings(res.data!);
      const b = res.data!.find((s) => s.key === "hdp_population_basis");
      if (b && typeof b.value === "string") setBasis(b.value);
      const l = res.data!.find((s) => s.key === "hdp_term_label");
      if (l && typeof l.value === "string") setHdpLabel(l.value);
    }
  }
  useEffect(() => { load(); }, []);

  async function save(key: string, value: unknown, description: string) {
    setMsg(null);
    const res = await api("/api/settings", { method: "PATCH", body: JSON.stringify({ key, value, description }) });
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: "Setelan disimpan" }); load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pengaturan Sistem</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title="Basis Populasi Indikator">
        <p className="text-sm text-gray-500 mb-3">Populasi penyebut untuk HDP, egg mass/ekor, dan konsumsi pakan/ekor. Berlaku untuk perhitungan baru & recompute.</p>
        <div className="flex gap-3 items-end">
          <Field label="Basis populasi">
            <Select value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="OPENING">Populasi awal (OPENING)</option>
              <option value="AVERAGE">Rata-rata (AVERAGE)</option>
              <option value="CLOSING">Populasi akhir (CLOSING)</option>
            </Select>
          </Field>
          <Button onClick={() => save("hdp_population_basis", basis, "Basis populasi untuk HDP/egg mass/feed intake")}>Simpan</Button>
        </div>
      </Card>

      <Card title="Istilah HDP">
        <div className="flex gap-3 items-end">
          <Field label="Label istilah produksi harian">
            <Input value={hdpLabel} onChange={(e) => setHdpLabel(e.target.value)} className="min-w-[280px]" />
          </Field>
          <Button onClick={() => save("hdp_term_label", hdpLabel, "Label istilah HDP di UI")}>Simpan</Button>
        </div>
      </Card>

      <Card title="Semua Setelan (JSON)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b"><tr><th className="py-2">Key</th><th>Value</th><th>Deskripsi</th></tr></thead>
            <tbody>
              {settings.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{s.key}</td>
                  <td className="font-mono text-xs">{JSON.stringify(s.value)}</td>
                  <td className="text-gray-500">{s.description}</td>
                </tr>
              ))}
              {settings.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-gray-400">Belum ada setelan tersimpan.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
