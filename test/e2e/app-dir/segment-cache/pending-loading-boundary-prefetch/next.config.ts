import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Without Cache Components, a dynamic route with a `loading.tsx` is
  // prefetched "up to the first loading boundary" (a LoadingBoundary
  // prefetch), which is the request this test holds open.
  cacheComponents: false,
}

export default nextConfig
