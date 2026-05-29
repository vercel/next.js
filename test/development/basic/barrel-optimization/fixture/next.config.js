module.exports = {
  transpilePackages: ['my-client-lib'],
  experimental: {
    optimizePackageImports: ['my-lib', 'recursive-barrel', 'my-client-lib'],
  },
}
