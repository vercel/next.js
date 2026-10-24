/** @type {import('next').NextConfig} */
module.exports = {
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      {
        // A URL under the dynamic [collection]/[...slug] route permanently
        // redirects to a static route whose tree has a different shape.
        source: '/docs/changelog',
        destination: '/changelog',
        permanent: true,
      },
    ]
  },
}
