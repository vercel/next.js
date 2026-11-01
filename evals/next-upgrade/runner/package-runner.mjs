#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from 'node:fs'
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

  while (['--', '--yes', '-y'].includes(args[packageIndex])) {
    packageIndex++
  }
  const requestedPackage = args[packageIndex]
  const invocationArgs = args.slice(packageIndex + 1)
  if (invocationArgs[0] === '--') invocationArgs.shift()
  return { requestedPackage, args: invocationArgs }
}

// Candidate codemods run real transforms; only package resolution is frozen.
if (
  runner === 'npm' &&
  ['info', 'show', 'view'].includes(args[0]) &&
  args[1] === '@next/codemod@canary'
) {
  const value =
    args[2] === 'version'
      ? config.codemodVersion
      : { version: config.codemodVersion }
  process.stdout.write(
    (args.includes('--json') ? JSON.stringify(value) : String(value)) + '\n'
  )
  process.exit(0)
}

const invocation = packageInvocation()
if (
  invocation &&
  ['@next/codemod@canary', `@next/codemod@${config.codemodVersion}`].includes(
    invocation.requestedPackage
  ) &&
  (!invocation.executable ||
    ['codemod', 'next-codemod'].includes(invocation.executable))
) {
  const result = spawnSync(
    process.execPath,
    [
      join(tools, 'codemod/node_modules/@next/codemod/bin/next-codemod.js'),
      ...invocation.args,
    ],
    { stdio: 'inherit', env: process.env }
  )
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}
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
if (result.error) {
  throw result.error
}
// Native preparation installs after setup; preserve output recording after that install.
if (
  result.status === 0 &&
  config.nudge &&
  runner === 'npm' &&
  ['install', 'ci'].includes(args[0]) &&
  existsSync('node_modules/.bin/next')
) {
  rmSync('node_modules/.bin/next')
  writeFileSync(
    'node_modules/.bin/next',
    `#!/bin/sh\nexec node ${tools}/entry.mjs "$@"\n`
  )
  chmodSync('node_modules/.bin/next', 0o755)
}
process.exit(result.status ?? 1)
