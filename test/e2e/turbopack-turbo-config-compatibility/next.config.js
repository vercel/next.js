module.exports = {
  turbopack: {
    resolveAlias: {
      foo: './turbopack.js',
    },
  },
  experimental: {
    turbo: {
      resolveAlias: {
        foo: './turbo.js',
      },
    },
  },
}
