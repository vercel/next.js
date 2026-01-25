/** @type {import('next').NextConfig} */
module.exports = {}

// For development: analyze the bundled chunks for stats app
if (process.env.ANALYZE) {
  const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: true,
  })
  module.exports = withBundleAnalyzer(module.exports)
}
