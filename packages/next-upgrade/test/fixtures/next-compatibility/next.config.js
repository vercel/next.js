module.exports = async (phase) => ({
  distDir: 'upgrade-output',
  experimental: { agentUpgrade: 'latest' },
  env: { NEXT_UPGRADE_CONFIG_PHASE: phase },
})
