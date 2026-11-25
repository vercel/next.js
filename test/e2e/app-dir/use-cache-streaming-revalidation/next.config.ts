import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The local handler retains stale entries so next start also uses background
  // regeneration. Deploy tests use Vercel's remote handler.
  cacheHandlers: process.env.VERCEL
    ? undefined
    : { remote: require.resolve('./cache-handler.cjs') },
}

export default nextConfig
