import Link from "next/link";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/recording/new", label: "Input Recording" },
  { href: "/recording", label: "Riwayat Recording" },
  { href: "/flocks", label: "Flock" },
  { href: "/houses", label: "Kandang" },
  { href: "/treatments", label: "Perlakuan" },
  { href: "/standards", label: "Standar Performa" },
  { href: "/alerts", label: "Peringatan" },
  { href: "/reports/flock", label: "Grafik Flock" },
  { href: "/reports", label: "Laporan" },
  { href: "/imports", label: "Impor Data" },
  { href: "/users", label: "Pengguna" },
  { href: "/settings", label: "Pengaturan" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-56 flex-col bg-white border-r print:hidden">
        <div className="px-4 py-4 border-b">
          <div className="font-bold text-brand-700">BrahmaFarm</div>
          <div className="text-xs text-gray-500">Produksi Ayam Petelur</div>
        </div>
        <nav className="flex-1 p-2 space-y-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className="block px-3 py-2 rounded-lg hover:bg-brand-50 text-gray-700">
              {n.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post" className="p-2 border-t">
          <button className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600">Keluar</button>
        </form>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="md:hidden bg-white border-b px-4 py-3 font-bold text-brand-700 print:hidden">BrahmaFarm</header>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
