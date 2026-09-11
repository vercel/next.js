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
      selectSecurityTarget: (source, snapshot) =>
        value.selectSecurityTarget(
          source,
          snapshot,
          new Date(`${fixture.recordedAt}T12:00:00Z`)
        ),
      readSecuritySnapshot: async () => ({
        ...(await value.readSecuritySnapshot()),
        checkedAt: `${fixture.recordedAt}T12:00:00Z`,
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
        const prompt = await value.prepareUpgradeResources(...args)
        const paths = /^Read and follow ("(?:[^"\\]|\\.)*")\. Use ("(?:[^"\\]|\\.)*") for/.exec(prompt)
        if (!paths) throw new Error('Upgrade handoff did not identify its retained resources.')
        fs.appendFileSync(
          `${root}/packets.jsonl`,
          JSON.stringify({
            contextPath: JSON.parse(paths[2]),
            workflowPath: JSON.parse(paths[1]),
          }) + '\n'
        )
        return prompt
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
