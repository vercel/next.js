/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackSeparateAsyncClientReferences: true,
  },
}

module.exports = nextConfig
