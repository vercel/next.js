/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheHandler: process.cwd() + '/cache-handler.js',
  images: {
    imageSizes: [100, 200, 400],
    customCacheHandler: true,
  },
}

module.exports = nextConfig
