module.exports = {
  transpilePackages: ['my-client-lib'],
  experimental: {
    optimizePackageImports: ['my-lib', 'my-client-lib'],
  },
}
