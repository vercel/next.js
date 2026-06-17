/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackContexts: {
      'my-ctx': {
        // Inherit the built-in App Route context (the route handler runs in it).
        inherits: 'next-app-route',
        // Add a custom resolve condition so `cond-pkg` resolves its `my-cond` export here.
        resolveConditions: ['my-cond'],
        // Add a loader rule that only applies within this context.
        rules: {
          '*.special.js': ['./special-loader.cjs'],
        },
      },
    },
  },
}

module.exports = nextConfig
