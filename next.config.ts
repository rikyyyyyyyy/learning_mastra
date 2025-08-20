import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.(node|md)$/,
      use: 'ignore-loader',
    });
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    
    return config;
  },
  serverExternalPackages: ['@libsql/client', 'libsql'],
};

export default nextConfig;
