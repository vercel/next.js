/** @type {import('next').NextConfig} */
const nextConfig = {
  deprecated: {
    // This fixture intentionally exercises the legacy loader-tree validation
    // for incomplete parallel routes. Strict matching removes those routes
    // before that validation can run. Once strict matching is the only mode,
    // this fixture should be removed in favor of the strict diagnostic.
    looseRouteMatching: true,
  },
}

module.exports = nextConfig
