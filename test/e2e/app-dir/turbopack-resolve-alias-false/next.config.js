/**
 * @type {import('next').NextConfig}
 */
const aliases = {
  // Alias a non-existent module to `false` to resolve it as an empty module.
  // The test covers each bundler's empty-module interop behavior.
  'some-lib': false,
}

const nextConfig = {
  turbopack: {
    resolveAlias: aliases,
  },
  webpack(config) {
    Object.assign(config.resolve.alias, aliases)
    return config
  },
}

module.exports = nextConfig
