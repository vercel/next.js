import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // TODO: Type-check excluded layouts once --debug-build-paths generates their slot types.
  // Webpack still type-checks the complete fixture.
  typescript: { ignoreBuildErrors: !!process.env.IS_TURBOPACK_TEST },
}

export default nextConfig
