/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    reactOwnerStack: process.env.TEST_OWNER_STACK !== 'false',
  },
}

module.exports = nextConfig
