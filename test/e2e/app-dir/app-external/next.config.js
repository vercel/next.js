module.exports = {
  reactStrictMode: true,
  transpilePackages: ['untranspiled-module', 'css', 'font'],
  experimental: {
    appDir: true,
    serverComponentsExternalPackages: ['conditional-exports-optout'],
  },
}
