// Mark config-load output so the terminal test can verify the menu clears it.
console.log('UPGRADE_TERMINAL_CONFIG_LOADED')

module.exports = {
  experimental: { agentUpgrade: 'security' },
}
