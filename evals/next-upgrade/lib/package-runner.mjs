#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tools = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(
  readFileSync(join(tools, 'package-runner.json'), 'utf8')
)
const [runner, ...args] = process.argv.slice(2)
const command = config[runner]

if (!command) throw new Error(`Unsupported package runner: ${runner}`)

function packageInvocation() {
  let packageIndex = -1
  if (runner === 'npx') {
    packageIndex = 0
  } else if (runner === 'npm' && ['exec', 'x'].includes(args[0])) {
    packageIndex = 1
  } else {
    return
  }

  const optionIndex = args.findIndex(
    (arg) => arg === '--package' || arg.startsWith('--package=')
  )
  if (optionIndex !== -1) {
    const requestedPackage = args[optionIndex].startsWith('--package=')
      ? args[optionIndex].slice('--package='.length)
      : args[optionIndex + 1]
    const separator = args.indexOf('--')
    if (separator === -1) return
    const [executable, ...invocationArgs] = args.slice(separator + 1)
    return { requestedPackage, executable, args: invocationArgs }
  }

  while (['--', '--yes', '-y'].includes(args[packageIndex])) packageIndex++
  const requestedPackage = args[packageIndex]
  const invocationArgs = args.slice(packageIndex + 1)
  if (invocationArgs[0] === '--') invocationArgs.shift()
  return { requestedPackage, args: invocationArgs }
}

const invocation = packageInvocation()
if (
  invocation &&
  ['next', 'next@canary', `next@${config.nextVersion}`].includes(
    invocation.requestedPackage
  ) &&
  (!invocation.executable || invocation.executable === 'next') &&
  ['upgrade', '--help', '-h', 'help'].includes(invocation.args[0])
) {
  const result = spawnSync(
    process.execPath,
    [join(tools, 'entry.mjs'), ...invocation.args],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NEXT_UPGRADE_EVAL_PACKAGE_RUNNER: runner,
        NEXT_UPGRADE_EVAL_REQUESTED_PACKAGE: invocation.requestedPackage,
      },
    }
  )
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
