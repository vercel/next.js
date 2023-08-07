module.exports = {
  experimental: {
    turbo: {
      resolveAlias: {
        foo: ['bar'],
        foo2: { browser: 'bar' },
      },
    },
  },
}
