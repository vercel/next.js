/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactCompiler: true,
  experimental: {
    // Keep covering the Babel plugin here. `turbopackRustReactCompiler` is
    // enabled by default on canary with Turbopack and is covered by the `rust`
    // variant.
    turbopackRustReactCompiler: false,
  },
  reactProductionProfiling: true,
}

module.exports = nextConfig
