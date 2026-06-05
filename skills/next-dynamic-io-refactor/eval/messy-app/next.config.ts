import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The whole point of the fixture. Do NOT turn this off to "fix" the build.
  cacheComponents: true,

  // Keep the build oracle focused on dynamic-IO correctness only — type noise
  // shouldn't gate the eval's verdict. (ESLint doesn't run during `next build`
  // on recent canaries, so no eslint key is needed.)
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
