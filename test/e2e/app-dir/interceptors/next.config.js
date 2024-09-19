/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  logging: false,
  experimental: {
    interceptors: true,
    ppr: Boolean(process.env.__NEXT_EXPERIMENTAL_PPR),
  },
}

module.exports = nextConfig
