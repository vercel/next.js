/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    interceptors: true,
    ppr: Boolean(process.env.__NEXT_EXPERIMENTAL_PPR),
  },
}

module.exports = nextConfig
