// Test-only I/O substitutions. The compiled CLI, resolver, packet and harness run normally.
const fs = require('node:fs')
const Module = require('node:module')
const root = '/tmp/next-upgrade-tools'
const fixture = JSON.parse(fs.readFileSync(`${root}/security.json`, 'utf8'))
const tools = JSON.parse(fs.readFileSync(`${root}/versions.json`, 'utf8'))
const realFetch = global.fetch
const response = (value) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  })
global.fetch = async (input, options) => {
  const url = String(input)
  if (url.startsWith('https://api.github.com/advisories?'))
    return response(fixture.advisories)
  if (url === 'https://registry.npmjs.org/next')
    return response(fixture.registry)
  if (url === 'https://registry.npmjs.org/%40next%2Fcodemod/canary')
    return response({ version: tools.codemod })
  return realFetch(input, options)
}
const originalLoad = Module._load
Module._load = function (id, parent, isMain) {
  const value = originalLoad.apply(this, arguments)
  // Freeze only the resolver's evidence clock. Harness/auth/process clocks remain real.
  if (
    id.endsWith('/security') &&
    parent?.filename.includes('/lib/upgrade/') &&
    typeof value.readSecuritySnapshot === 'function'
  ) {
    return {
      ...value,
      readSecuritySnapshot: async () => ({
        ...(await value.readSecuritySnapshot()),
        checkedAt: `${fixture.recordedAt}T12:00:00Z`,
      }),
    }
  }
  if (
    id.endsWith('/upgrade/resolve') &&
    typeof value.resolveUpgrade === 'function'
  ) {
    return {
      ...value,
      resolveUpgrade: (input, overrides = {}) =>
        value.resolveUpgrade(input, {
          ...overrides,
          now: () => new Date(`${fixture.recordedAt}T12:00:00Z`),
        }),
    }
  }
  if (id === 'next/dist/compiled/cross-spawn' && typeof value === 'function') {
    return Object.assign(function (command, args, options) {
      if (command === 'codex' || command === 'claude') {
        const requestedArgs = [...args]
        const modelIndex = args.indexOf('--model')
        const gatewayModel = process.env.NEXT_UPGRADE_EVAL_CLI_MODEL
        if (modelIndex >= 0 && gatewayModel) {
          args = [...args]
          args[modelIndex + 1] = gatewayModel
        }
        fs.appendFileSync(
          `${root}/harness-launches.jsonl`,
          JSON.stringify({
            command,
            args: requestedArgs,
            transportArgs: args,
            cwd: options?.cwd,
          }) + '\n'
        )
      }
      return value(command, args, options)
    }, value)
  }
  if (
    id.endsWith('/upgrade/resources') &&
    typeof value.prepareUpgradeResources === 'function'
  ) {
    return {
      ...value,
      prepareUpgradeResources: async (...args) => {
        const packet = await value.prepareUpgradeResources(...args)
        fs.appendFileSync(
          `${root}/packets.jsonl`,
          JSON.stringify({
            contextPath: packet.contextPath,
            workflowPath: packet.workflowPath,
          }) + '\n'
        )
        return packet
      },
    }
  }
  return value
}
fs.appendFileSync(
  `${root}/entrypoints.jsonl`,
  JSON.stringify({
    args: process.argv.slice(2),
    at: new Date().toISOString(),
  }) + '\n'
)
