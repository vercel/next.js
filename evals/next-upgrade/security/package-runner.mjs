#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
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

if (
  runner === 'npm' &&
  ['run', 'run-script'].includes(args[0]) &&
  config.candidateScripts.includes(args[1])
) {
  const script = args[1]
  const separator = args.indexOf('--')
  const result = spawnSync(
    process.execPath,
    [
      join(tools, 'entry.mjs'),
      script,
      ...(separator === -1 ? [] : args.slice(separator + 1)),
    ],
    { stdio: 'inherit', env: process.env }
  )
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

if (runner === 'git' && args[0] === 'remote' && args.includes('-v')) {
  process.stdout.write(
    `origin\t${config.repository} (fetch)\norigin\t${config.repository} (push)\n`
  )
  process.exit(0)
}

if (
  runner === 'git' &&
  args[0] === 'remote' &&
  args[1] === 'get-url' &&
  args[2] === 'origin'
) {
  process.stdout.write(`${config.repository}\n`)
  process.exit(0)
}

if (runner === 'git' && ['fetch', 'push', 'ls-remote'].includes(args[0])) {
  for (let index = 1; index < args.length; index++) {
    if (args[index] === 'origin' || args[index] === config.repository) {
      args[index] = config.remote
      break
    }
  }
}

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
  config.skillInstructions &&
  invocationArgs?.[0] === 'use' &&
  requestedPackage?.startsWith('skills@')
) {
  appendFileSync(
    join(tools, 'skill-runs.jsonl'),
    JSON.stringify({ requestedPackage, args: invocationArgs }) + '\n'
  )
  process.stdout.write(readFileSync(config.skillInstructions, 'utf8'))
  process.exit(0)
}

if (
  invocationArgs &&
  (requestedPackage === '@next/codemod@canary' ||
    requestedPackage === `@next/codemod@${config.codemodVersion}` ||
    (config.skillInstructions &&
      requestedPackage === '@next/codemod@latest')) &&
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

if (
  result.status === 0 &&
  runner === 'npm' &&
  args.length === 1 &&
  args[0] === 'install' &&
  config.prepareFixture
) {
  rmSync('node_modules/next', { force: true, recursive: true })
  symlinkSync(config.candidateNext, 'node_modules/next', 'dir')

  const candidateNextScope = join(config.candidateModules, '@next')
  const projectNextScope = join('node_modules', '@next')
  mkdirSync(projectNextScope, { recursive: true })
  for (const name of readdirSync(candidateNextScope)) {
    if (!name.startsWith('swc-')) continue
    const target = join(projectNextScope, name)
    rmSync(target, { force: true, recursive: true })
    symlinkSync(join(candidateNextScope, name), target, 'dir')
  }
}

process.exit(result.status ?? 1)
