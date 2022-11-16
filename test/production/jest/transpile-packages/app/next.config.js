/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    transpilePackages: ['@hashicorp/platform-util'],
  },
}

module.exports = nextConfig
