module.exports = {
  serverExternalPackages: ['@storybook/global', 'lodash'],
  experimental: {
    turbopackModuleIds: 'named',
    turbopackMinify: false,
    turbopackScopeHoisting: false,
  },
}
