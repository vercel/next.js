/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  logging: {
    incomingRequest: {
      ignore: [/^\/hello/, /^\/non-existent/, /^\/_next\/static\//],
    },
  },
}

module.exports = nextConfig
