"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import { Card, Button, Field, Input, Select, Alert } from "@/components/ui";

interface UserRow {
  id: string; email: string; fullName: string; isActive: boolean;
  roles: { code: string; name: string; farm: string | null }[];
}
interface Farm { id: string; code: string; name: string }

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [form, setForm] = useState({ email: "", fullName: "", password: "", phone: "", roleCode: "HOUSE_OPERATOR", farmId: "" });

  async function load() {
    const [u, f] = await Promise.all([apiGet<UserRow[]>("/api/users"), apiGet<Farm[]>("/api/farms")]);
    if (u.ok) setRows(u.data!);
    if (f.ok) setFarms(f.data!);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await apiPost("/api/users", {
      email: form.email, fullName: form.fullName, password: form.password, phone: form.phone || undefined,
      roleCode: form.roleCode, farmId: form.farmId || undefined,
    });
    if (!res.ok) { setMsg({ kind: "error", text: res.error?.message ?? "Gagal" }); return; }
    setMsg({ kind: "success", text: "Pengguna dibuat" });
    setForm({ email: "", fullName: "", password: "", phone: "", roleCode: "HOUSE_OPERATOR", farmId: "" });
    setShow(false); load();
  }

  const roleLabel: Record<string, string> = { SUPER_ADMIN: "Super Admin", FARM_ADMIN: "Admin Peternakan", HOUSE_OPERATOR: "Petugas Kandang" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Pengguna</h1>
        <Button onClick={() => setShow((s) => !s)}>{show ? "Tutup" : "+ Tambah Pengguna"}</Button>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {show && (
        <Card title="Tambah Pengguna">
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <Field label="Nama lengkap"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
            <Field label="Kata sandi (min 8)"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
            <Field label="Telepon"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Peran">
              <Select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
                <option value="HOUSE_OPERATOR">Petugas Kandang</option>
                <option value="FARM_ADMIN">Admin Peternakan</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </Select>
            </Field>
            <Field label="Peternakan (untuk admin/petugas)">
              <Select value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value })}>
                <option value="">— (semua / super admin) —</option>
                {farms.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
              </Select>
            </Field>
            <div className="flex items-end"><Button type="submit">Simpan</Button></div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b"><tr><th className="py-2">Nama</th><th>Email</th><th>Peran</th><th>Aktif</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2">{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>{u.roles.map((r) => `${roleLabel[r.code] ?? r.code}${r.farm ? ` (${r.farm})` : ""}`).join(", ")}</td>
                  <td>{u.isActive ? "Ya" : "Tidak"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">Belum ada pengguna.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
