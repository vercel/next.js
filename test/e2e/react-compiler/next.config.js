/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    reactCompiler: true,
  },
  reactProductionProfiling: true,
}

module.exports = nextConfig
