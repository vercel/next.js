/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // distDir: '.next-custom',
  experimental: {
    prefetchInlining: false,
  },
}

module.exports = nextConfig
