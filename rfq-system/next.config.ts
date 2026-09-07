import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config) => {
    // Handle better-sqlite3 native module
    config.externals.push({
      'better-sqlite3': 'commonjs better-sqlite3',
    });

    return config;
  },
};

export default nextConfig;
