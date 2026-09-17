import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // grammY тянет node-fetch и abort-controller — пусть грузится как обычный
  // node-модуль, а не пересобирается бандлером.
  serverExternalPackages: ["grammy"],
};

export default nextConfig;
