import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaProvider from "@/components/PwaProvider";

export const metadata: Metadata = {
  title: "BrahmaFarm — Recording Produksi Ayam Petelur",
  description: "Sistem recording produksi ayam petelur multi-kandang",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#268049",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        {children}
        <PwaProvider />
      </body>
    </html>
  );
}
