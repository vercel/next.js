/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      // The synthetic module of a `require.context()` call is internal, so a rule
      // that would match its path doesn't apply to it.
      '*.require-context.cjs': {
        type: 'asset',
      },
    },
  },
}

module.exports = nextConfig
