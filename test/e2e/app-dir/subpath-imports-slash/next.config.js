/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Force the fixture package to be bundled so its internal `#/...` require
  // is resolved by the bundler (enhanced-resolve / Turbopack), not by Node
  // at runtime.
  transpilePackages: ['external-slash-pkg'],
  typescript: {
    // The auto-generated tsconfig has no `paths` for `#/*`, and we
    // intentionally don't add one so that JsConfigPathsPlugin can't mask the
    // package.json `imports` resolution this test targets.
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
