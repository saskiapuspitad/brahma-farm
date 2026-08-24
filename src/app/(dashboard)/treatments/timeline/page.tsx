"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { Card } from "@/components/ui";

interface Treatment {
  id: string; name: string; startDate: string; status: string;
  category: { name: string }; flock: { code: string }; house: { code: string };
}

export default function TreatmentTimelinePage() {
  const [rows, setRows] = useState<Treatment[]>([]);
  useEffect(() => { apiGet<Treatment[]>("/api/treatments").then((r) => r.ok && setRows(r.data!)); }, []);

  // Kelompokkan per bulan.
  const groups = rows.reduce<Record<string, Treatment[]>>((acc, t) => {
    const key = t.startDate?.slice(0, 7) ?? "—";
    (acc[key] ??= []).push(t);
    return acc;
  }, {});
  const keys = Object.keys(groups).sort().reverse();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Timeline Perlakuan</h1>
      {keys.length === 0 && <Card><p className="text-sm text-gray-400">Belum ada perlakuan.</p></Card>}
      {keys.map((k) => (
        <Card key={k} title={k}>
          <ol className="relative border-l-2 border-brand-100 ml-2 space-y-3">
            {groups[k].map((t) => (
              <li key={t.id} className="ml-4">
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-brand-500" />
                <div className="text-sm">
                  <span className="font-medium">{t.startDate?.slice(0, 10)}</span> · {t.category.name} — {t.name}
                  <span className="text-gray-500"> ({t.flock.code} / {t.house.code})</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ))}
      <p className="text-xs text-gray-400">Marker perlakuan pada grafik performa bersifat deskriptif, bukan bukti sebab-akibat.</p>
    </div>
  );
}
