import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pinned so Flight client-reference import rows carry the same `?dpl=` marker
  // bytes as a production deployment, matching bench/basic-app.
  deploymentId: 'dpl_bench_next_beats',
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
