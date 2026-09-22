module.exports = () => {
  const config = { experimental: { agenticAutoUpgrade: 'latest' } }
  switch (process.env.NEXT_TEST_UPGRADE_CONFIG_KIND) {
    case 'plain':
      return { ...config, distDir: '.custom' }
    case 'legacy':
      return { ...config, target: 'serverless' }
    default:
      return { ...config, adapterPath: require.resolve('./adapter.js') }
  }
}
