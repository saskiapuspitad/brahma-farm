"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Gagal login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand-700">BrahmaFarm</h1>
          <p className="text-sm text-gray-500">Recording Produksi Ayam Petelur</p>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2" placeholder="admin@brahmafarm.local" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Kata Sandi</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2" placeholder="••••••••" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium disabled:opacity-60">
          {loading ? "Memproses…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
