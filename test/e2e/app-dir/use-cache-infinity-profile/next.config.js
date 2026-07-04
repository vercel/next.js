/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
  cacheLife: {
    // The documented way to say "never revalidate/expire".
    frozen: { stale: 300, revalidate: Infinity, expire: Infinity },
  },
}

module.exports = nextConfig
