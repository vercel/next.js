import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Gives the async loader of `lib/dyn.ts` different code in the chunks of
    // one route, depending on what is already available where it's imported.
    turbopackServerSideNestedAsyncChunking: true,
  },
}

export default nextConfig
