/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    // The documented way to say "never revalidate/expire".
    frozen: { stale: 300, revalidate: Infinity, expire: Infinity },
  },
}

module.exports = nextConfig
