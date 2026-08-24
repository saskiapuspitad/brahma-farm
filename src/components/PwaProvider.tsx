"use client";

import { useEffect, useState } from "react";
import { readOutbox, flushOutbox } from "@/lib/offline";

/**
 * Mendaftarkan service worker, menampilkan indikator online/offline,
 * dan mengirim ulang outbox saat kembali online.
 */
export default function PwaProvider() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    setOnline(navigator.onLine);
    setPending(readOutbox().length);

    async function goOnline() {
      setOnline(true);
      const sent = await flushOutbox();
      setPending(readOutbox().length);
      if (sent > 0) {
        // beri tahu halaman lain untuk refresh bila perlu
        window.dispatchEvent(new CustomEvent("brahmafarm:synced", { detail: { sent } }));
      }
    }
    function goOffline() { setOnline(false); }

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const onOutbox = () => setPending(readOutbox().length);
    window.addEventListener("brahmafarm:outbox", onOutbox);

    // Coba flush saat mount bila ada antrean.
    if (navigator.onLine && readOutbox().length > 0) goOnline();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("brahmafarm:outbox", onOutbox);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-sm shadow-lg ${online ? "bg-amber-500 text-white" : "bg-gray-800 text-white"}`}>
      {online
        ? `Menyinkronkan ${pending} recording tertunda…`
        : `Mode offline — input akan disimpan & dikirim saat online${pending ? ` (${pending} tertunda)` : ""}`}
    </div>
  );
}
