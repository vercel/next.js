/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    after: true,
    testProxy: true,
    instrumentationHook: true,
  },
}
