import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer }) => {
    // Handle better-sqlite3 native module
    config.externals.push({
      'better-sqlite3': 'commonjs better-sqlite3',
    });

    // Ensure @ alias resolves correctly
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
    };

    return config;
  },
};

export default nextConfig;
