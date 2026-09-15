#!/usr/bin/env node
import { appendFileSync, existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const tools = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const executable = join(tools, 'next/node_modules/next/dist/bin/next')

if (args[0] === 'upgrade') {
  const assessment = join(tools, 'security/assessment.mjs')
  if (existsSync(assessment)) await import(pathToFileURL(assessment).href)
  process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = '1'
  appendFileSync(
    join(tools, 'invocations.jsonl'),
    JSON.stringify({
      args,
      executable: realpathSync(executable),
      cwd: process.cwd(),
    }) + '\n'
  )
}

process.argv = [process.execPath, executable, ...args]
await import(pathToFileURL(executable).href)
