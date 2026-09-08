import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Opts every route into runtime Cached Navigations, so the navigation render
  // also embeds a runtime prefetch payload rendered in a second Flight pass.
  partialPrefetching: true,
}

export default nextConfig
