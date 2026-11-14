/** @type {import('next').NextConfig} */
module.exports = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      // A URL under the dynamic [...slug] route is rewritten to a different
      // param value of the same route.
      { source: '/old', destination: '/docs/one' },
    ]
  },
}
