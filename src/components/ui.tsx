"use client";

import React from "react";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    EMPTY: "bg-gray-100 text-gray-600",
    SANITATION: "bg-amber-100 text-amber-700",
    INACTIVE: "bg-gray-200 text-gray-500",
    PREPARATION: "bg-sky-100 text-sky-700",
    COMPLETED: "bg-blue-100 text-blue-700",
    CULLED: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    ACTIVE: "Aktif", EMPTY: "Kosong", SANITATION: "Sanitasi", INACTIVE: "Nonaktif",
    PREPARATION: "Persiapan", COMPLETED: "Selesai", CULLED: "Afkir",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100"}`}>{label[status] ?? status}</span>;
}

export function Card({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({ children, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "danger" }) {
  const cls =
    variant === "primary" ? "bg-brand-600 hover:bg-brand-700 text-white" :
    variant === "danger" ? "bg-red-600 hover:bg-red-700 text-white" :
    "border border-brand-600 text-brand-700 hover:bg-brand-50";
  return <button {...props} className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60 ${cls} ${props.className ?? ""}`}>{children}</button>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-600 mb-1">{label}</label>{children}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border rounded-lg px-3 py-2 ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full border rounded-lg px-3 py-2 ${props.className ?? ""}`} />;
}

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: React.ReactNode }) {
  const cls = kind === "error" ? "bg-red-50 text-red-700 border-red-200" :
    kind === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-sky-50 text-sky-700 border-sky-200";
  return <div className={`text-sm border rounded p-2 ${cls}`}>{children}</div>;
}
