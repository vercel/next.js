#!/usr/bin/env node
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const root = '/tmp/next-upgrade-tools'
const versions = JSON.parse(fs.readFileSync(`${root}/versions.json`, 'utf8'))
let args = process.argv.slice(2)
let command = versions.packageRunner
const next = args[0] === 'exec' ? 1 : 0
const dlx = args.indexOf('dlx')
if (args[next] === 'next' && args[next + 1] === 'upgrade') {
  // Exercise the candidate upgrade CLI even when the app's old runtime is
  // selected through pnpm exec. All other package-local commands stay real.
  command = process.execPath
  args = [
    '--require',
    `${root}/resolver-fixture.cjs`,
    `${root}/next/node_modules/next/dist/bin/next`,
    ...args.slice(next + 1),
  ]
} else if (
  dlx !== -1 &&
  args[dlx + 1] === `@next/codemod@${versions.codemod}`
) {
  command = process.execPath
  args = [
    `${root}/codemod/node_modules/@next/codemod/bin/next-codemod.js`,
    ...args.slice(dlx + 2),
  ]
  fs.appendFileSync(
    `${root}/codemod-runs.jsonl`,
    JSON.stringify({ args: args.slice(1), at: new Date().toISOString() }) + '\n'
  )
}
const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
