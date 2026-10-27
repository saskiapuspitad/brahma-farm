import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit membaca file font (.afm) dari foldernya sendiri saat runtime; jika di-bundle,
  // file itu hilang (ENOENT Helvetica.afm). Muat langsung dari node_modules.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // BigInt di route handlers ditangani via serialize(); tidak perlu konfigurasi khusus.
  },
};

export default nextConfig;
