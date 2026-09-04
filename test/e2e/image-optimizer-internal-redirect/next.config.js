/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [{ protocol: 'http', hostname: '127.0.0.1' }],
  },
}

module.exports = nextConfig
