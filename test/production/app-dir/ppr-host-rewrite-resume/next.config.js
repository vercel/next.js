module.exports = {
  cacheComponents: true,
  basePath: process.env.TEST_PPR_BASE_PATH || '',
  async rewrites() {
    return {
      beforeFiles: ['/', '/article'].map((source) => ({
        source,
        has: [{ type: 'host', value: '(?<tenant>[a-z.]+)' }],
        destination:
          source === '/' ? '/sites/:tenant' : '/sites/:tenant/article',
      })),
      afterFiles: [],
      fallback: [],
    }
  },
}
