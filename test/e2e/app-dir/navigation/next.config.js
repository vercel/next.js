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
    // TODO: Under `optimisticRouting: true`, the hash-scroll test
    // (`describe('hash')` › "should scroll to the specified hash") times
    // out on the first hash-link click. Other hash tests in this file
    // (`hash-with-scroll-offset`, `hash-link-back-to-same-page`) pass
    // under the new default, so the interaction is specific to this
    // test's setup (same-path hash links + a large 5000-item DOM +
    // request-tracking via `beforePageLoad`). Needs investigation. Pin
    // to the old default until then (or until the flag is removed).
    optimisticRouting: false,
  },
}
