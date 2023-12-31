module.exports = {
  reactStrictMode: true,
  transpilePackages: ['untranspiled-module', 'css', 'font'],
  experimental: {
    serverComponentsExternalPackages: [
      'conditional-exports-optout',
      'dual-pkg-optout',
    ],
  },
}
