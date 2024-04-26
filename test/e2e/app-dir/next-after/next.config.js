/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  experimental: {
    after: true,
    testProxy: true,
  },
}
