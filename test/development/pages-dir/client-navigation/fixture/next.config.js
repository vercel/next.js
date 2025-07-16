/** @type {import('next').NextConfig} */
module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  experimental:
    process.env.TEST_STRICT_NEXT_HEAD !== undefined
      ? {
          strictNextHead: process.env.TEST_STRICT_NEXT_HEAD === 'true',
        }
      : {},
  // scroll position can be finicky with the
  // indicators showing so hide by default
  devIndicators: false,
}
