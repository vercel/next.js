/** @type {import('next').NextConfig} */
module.exports = {
  instrumentationClientInject: ['./inject-a.js', './inject-b.js'],
  experimental: {
    turbopackMinify: false,
    turbopackModuleIds: 'named',
    turbopackScopeHoisting: false,
  },
}
