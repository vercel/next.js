/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // TODO(appShells): migrate this test to the two-phase (app shell +
    // per-page data) prefetch behavior, then remove this override. See #94516.
    appShells: false,
  },
}

module.exports = nextConfig
