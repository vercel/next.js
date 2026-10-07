#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const tools = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
// `@next/upgrade <args>` runs the candidate @next/upgrade executable; anything
// else runs the candidate `next` CLI.
const upgradePackage = args[0] === '@next/upgrade'
if (upgradePackage) args.shift()
const upgradeDirectory = join(tools, 'next/node_modules/@next/upgrade')
const executable = upgradePackage
  ? join(upgradeDirectory, 'bin/next-upgrade.js')
  : join(tools, 'next/node_modules/next/dist/bin/next')
const assessment = join(tools, 'security/assessment.mjs')
const runsUpgrade = upgradePackage || args[0] === 'upgrade'
appendFileSync(
  join(tools, 'invocations.jsonl'),
  JSON.stringify({
    args: upgradePackage ? ['@next/upgrade', ...args] : args,
    executable: realpathSync(executable),
    cwd: process.cwd(),
    ...(runsUpgrade
      ? {
          packageRunner: process.env.NEXT_UPGRADE_EVAL_PACKAGE_RUNNER,
          requestedPackage: process.env.NEXT_UPGRADE_EVAL_REQUESTED_PACKAGE,
        }
      : {}),
  }) + '\n'
)

if (args[0] === 'build' && !upgradePackage && existsSync(assessment)) {
  const result = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(assessment).href, executable, ...args],
    { stdio: 'inherit', env: process.env }
  )
  if (result.error) throw result.error
  appendFileSync(
    join(tools, 'command-results.jsonl'),
    JSON.stringify({ args, exitCode: result.status ?? 1 }) + '\n'
  )
  process.exit(result.status ?? 1)
}

if (existsSync(assessment)) await import(pathToFileURL(assessment).href)

if (runsUpgrade) {
  // Use the candidate @next/upgrade instead of looking up the latest canary.
  const { version } = JSON.parse(
    readFileSync(join(upgradeDirectory, 'package.json'), 'utf8')
  )
  process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = version
}

process.argv = [process.execPath, executable, ...args]
await import(pathToFileURL(executable).href)
