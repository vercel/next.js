#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const tools = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const executable = join(tools, 'next/node_modules/next/dist/bin/next')
const assessment = join(tools, 'security/assessment.mjs')
appendFileSync(
  join(tools, 'invocations.jsonl'),
  JSON.stringify({
    args,
    executable: realpathSync(executable),
    cwd: process.cwd(),
    ...(args[0] === 'upgrade'
      ? {
          packageRunner: process.env.NEXT_UPGRADE_EVAL_PACKAGE_RUNNER,
          requestedPackage: process.env.NEXT_UPGRADE_EVAL_REQUESTED_PACKAGE,
        }
      : {}),
  }) + '\n'
)

if (args[0] === 'build' && existsSync(assessment)) {
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

if (args[0] === 'upgrade') {
  const { version } = JSON.parse(
    readFileSync(join(tools, 'next/node_modules/next/package.json'), 'utf8')
  )
  process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = version
}

process.argv = [process.execPath, executable, ...args]
await import(pathToFileURL(executable).href)
