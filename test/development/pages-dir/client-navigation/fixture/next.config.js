/** @type {import('next').NextConfig} */
module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  experimental: {
    strictNextHead: process.env.TEST_STRICT_NEXT_HEAD !== 'false',
  },
  // scroll position can be finicky with the
  // indicators showing so hide by default
  devIndicators: false,
}
