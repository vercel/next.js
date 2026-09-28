/** @type {import('next').NextConfig} */
const nextConfig = {
  deprecated: {
    // This fixture exercises the legacy missing-default validation directly.
    // Keep that coverage if strict route matching becomes the default; once
    // strict matching is the only mode, this fixture can be removed.
    looseRouteMatching: true,
  },
}

module.exports = nextConfig
