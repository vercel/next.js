// Exercise the real CLI lifecycle with deterministic metadata and no actual upgrade.
if (!process.stdin.isTTY) {
  Object.defineProperty(process.stdin, 'isTTY', { value: true })
  process.stdin.setRawMode = () => process.stdin
}
if (!process.stdout.isTTY)
  Object.defineProperty(process.stdout, 'isTTY', { value: true })

function replace(name, exports) {
  const id = require.resolve(name)
  require(id)
  require.cache[id].exports = exports
}
replace('next/dist/telemetry/agent-name', { getAgentName: async () => null })
replace('next/dist/server/ci-info', { isCI: false })
replace('next/dist/lib/upgrade/prepare-upgrade', {
  getSecurityAdvisory: async () => ({
    reference: 'https://example.com/advisory',
  }),
})
replace('next/dist/lib/upgrade/human-preferences', {
  getUpgradePreferenceKey: async () => 'fixture',
  upgradePreferences: () => ({ isDismissed: () => false, dismiss: () => {} }),
})
replace('next/dist/lib/upgrade/run-child-process', {
  runChildProcess: async (_command, args) => {
    if (process.env.HUMAN_NUDGE_PORT) {
      // The upgrade must not start while the dev worker still owns its port.
      const server = require('net').createServer()
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(Number(process.env.HUMAN_NUDGE_PORT), () =>
          server.close(resolve)
        )
      })
    }
    console.log('UPGRADE_HANDOFF', JSON.stringify(args.slice(1)))
    return 23
  },
})
const human = require('next/dist/lib/upgrade/human-nudge')
replace('next/dist/lib/upgrade/human-nudge', {
  ...human,
  assessHumanUpgrade: async (directory, context) => {
    const result = await human.assessHumanUpgrade(directory, context, '16.0.0')
    return result
  },
})
