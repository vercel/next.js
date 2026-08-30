/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Match the production fingerprint in https://github.com/vercel/next.js/issues/98066:
  // a non-zero staleTimes.dynamic is what makes a stalled RSC navigation
  // reuse the poisoned BFCache entry and drop later clicks with zero requests.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
}

module.exports = nextConfig
