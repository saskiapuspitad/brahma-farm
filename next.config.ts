import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // BigInt di route handlers ditangani via serialize(); tidak perlu konfigurasi khusus.
  },
};

export default nextConfig;
