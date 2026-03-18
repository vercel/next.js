/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      // Alias a non-existent module to `false` to resolve it as an empty module.
      // This tests that `resolveAlias: false` produces `{}` for namespace/CJS
      // imports and `undefined` for named/default imports.
      'some-lib': false,
    },
  },
}

module.exports = nextConfig
