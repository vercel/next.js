#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const tools = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const executable = join(tools, 'next/node_modules/next/dist/bin/next')
const assessment = join(tools, 'security/assessment.mjs')
const assessmentConfig = join(tools, 'security/assessment.json')

if (existsSync(assessmentConfig)) {
  const { source } = JSON.parse(readFileSync(assessmentConfig, 'utf8'))
  if (source) process.env.__NEXT_VERSION = source
}
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
  process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = '1'
}

process.argv = [process.execPath, executable, ...args]
await import(pathToFileURL(executable).href)
