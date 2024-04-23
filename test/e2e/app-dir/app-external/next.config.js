module.exports = {
  reactStrictMode: true,
  transpilePackages: ['css', 'font', 'transpile-ts-lib', 'transpile-cjs-lib'],
  experimental: {
    serverComponentsExternalPackages: [
      'conditional-exports-optout',
      'dual-pkg-optout',
    ],
  },
}
