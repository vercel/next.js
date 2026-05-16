/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  logging: {
    incomingRequests: {
      ignore: [/^\/hello/, /^\/non-existent/, /^\/_next\/static\//],
    },
  },
}

module.exports = nextConfig
