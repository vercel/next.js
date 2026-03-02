/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  experimental: {
    turbopackMinify: false,
    turbopackModuleIds: 'named',
    turbopackScopeHoisting: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}
