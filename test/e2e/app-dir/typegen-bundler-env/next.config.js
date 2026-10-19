// cssChunking: "graph" is Turbopack-only. loadConfig throws when TURBOPACK is
// not set, letting the test assert that typegen selects the right bundler.
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cssChunking: 'graph',
  },
}
module.exports = nextConfig
