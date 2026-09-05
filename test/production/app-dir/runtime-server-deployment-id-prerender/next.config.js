/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Auto-enabled on Vercel when skew protection is on.
    runtimeServerDeploymentId: true,
  },
}

module.exports = nextConfig
