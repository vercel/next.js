/** @type {import('next').NextConfig} */
module.exports = {
  redirects: () => {
    return [
      {
        source: '/redirect/a',
        destination: '/redirect-dest',
        permanent: false,
      },
    ]
  },
  // scroll position can be finicky with the
  // indicators showing so hide by default
  devIndicators: false,
  experimental: {
    // TODO: The hash-scroll test asserts on the pre-`optimisticRouting`
    // navigation timing. Pin the fixture to the old default until the test
    // is updated (or until the flag is removed).
    optimisticRouting: false,
  },
}
