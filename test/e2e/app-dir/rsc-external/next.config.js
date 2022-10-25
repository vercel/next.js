module.exports = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
    serverComponentsExternalPackages: ['conditional-exports-optout'],
    transpilePackages: ['untranspiled-module'],
  },
}
