/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    chunkLoadingGlobal: 'myApp',
  },
}

module.exports = nextConfig
