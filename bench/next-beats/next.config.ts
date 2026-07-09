import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  partialPrefetching: true,
  experimental: {
    inlineCss: true,
    useOffline: true,
    viewTransition: true,
  },
  typedRoutes: true,
};

export default nextConfig;
