/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // This fixture intentionally exercises the legacy loader-tree validation
    // for incomplete parallel routes. Strict matching removes those routes
    // before that validation can run. Once strict matching is the only mode,
    // this fixture should be removed in favor of the strict diagnostic.
    strictRouteMatching: false,
  },
}

module.exports = nextConfig
