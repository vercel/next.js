module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/',
      },
      {
        source: '/rewrite-me-dynamic',
        destination: '/first',
      },
    ]
  },
  adapterPath:
    process.env.NEXT_ADAPTER_PATH ?? require.resolve('./my-adapter.js'),
}
