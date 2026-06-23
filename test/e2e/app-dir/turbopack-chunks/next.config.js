/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackMinify: false,
    turbopackModuleIds: 'named',
    turbopackScopeHoisting: false,
    turbopackContexts: {
      'my-ctx': {
        // Inherit the built-in App Route context (the route handler runs in it).
        inherits: 'next-app-route',
        moduleLoading: 'edge',
      },
    },
  },
}

module.exports = nextConfig
