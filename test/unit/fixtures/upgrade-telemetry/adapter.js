module.exports = {
  name: 'telemetry-consent-fixture',
  modifyConfig(config) {
    if (process.env.NEXT_TEST_UPGRADE_CONFIG_KIND === 'export') {
      return { ...config, output: 'export', distDir: 'exported-site' }
    }
    return { ...config, distDir: '.custom' }
  },
}
