import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: { cpus: 1 },
}
export default nextConfig
