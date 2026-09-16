#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const security = dirname(fileURLToPath(import.meta.url))
const tools = dirname(security)
const config = JSON.parse(
  readFileSync(join(security, 'package-runner.json'), 'utf8')
)
const [runner, ...args] = process.argv.slice(2)
if (!['git', 'npm', 'npx'].includes(runner))
  throw new Error(`Unsupported package runner: ${runner}`)

const record = (event) =>
  appendFileSync(
    join(tools, 'codemod-runs.jsonl'),
    JSON.stringify(event) + '\n'
  )

if (runner === 'git' && args[0] === 'ls-remote') {
  appendFileSync(
    join(tools, 'provider.jsonl'),
    JSON.stringify({ runner, args }) + '\n'
  )
}

if (
  runner === 'npm' &&
  ['info', 'show', 'view'].includes(args[0]) &&
  args[1] === '@next/codemod@canary'
) {
  record({
    kind: 'resolve',
    requestedArgs: args,
    resolvedVersion: config.codemodVersion,
    cwd: process.cwd(),
  })
  const value =
    args[2] === 'version'
      ? config.codemodVersion
      : { version: config.codemodVersion }
  process.stdout.write(
    (args.includes('--json') ? JSON.stringify(value) : String(value)) + '\n'
  )
  process.exit(0)
}

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
const requestedPackage = invocation?.requestedPackage
const executable = invocation?.executable
const invocationArgs = invocation?.args

if (
  invocationArgs &&
  (requestedPackage === '@next/codemod@canary' ||
    requestedPackage === `@next/codemod@${config.codemodVersion}`) &&
  (!executable || ['codemod', 'next-codemod'].includes(executable))
) {
  record({
    kind: 'run',
    requestedPackage,
    requestedArgs: args,
    resolvedVersion: config.codemodVersion,
    args: invocationArgs,
    cwd: process.cwd(),
  })
  const result = spawnSync(
    process.execPath,
    [
      join(tools, 'codemod/node_modules/@next/codemod/bin/next-codemod.js'),
      ...invocationArgs,
    ],
    { stdio: 'inherit', env: process.env }
  )
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

const result = spawnSync(
  runner === 'git' ? config.git : process.execPath,
  runner === 'git' ? args : [config.baseRunner, runner, ...args],
  {
    stdio: 'inherit',
    env: process.env,
  }
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
