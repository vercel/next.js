/** @type {import('next').NextConfig} */
module.exports = {
  cacheComponents: true,
  experimental: {
    serverSourceMaps: true,
    suspenseProfiling: true,
  },
}
