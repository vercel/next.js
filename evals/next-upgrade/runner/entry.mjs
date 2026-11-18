#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run the actual candidate. Preserve its raw output before a grader is present.
const tools = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const candidateCommand = ['upgrade', '--help', '-h', 'help'].includes(args[0])
const executable = candidateCommand
  ? join(tools, 'next/node_modules/next/dist/bin/next')
  : createRequire(join(process.cwd(), 'package.json')).resolve(
      'next/dist/bin/next'
    )
const version = JSON.parse(
  readFileSync(join(dirname(executable), '../../package.json'), 'utf8')
).version
const id = randomUUID()
appendFileSync(
  join(tools, 'invocations.jsonl'),
  JSON.stringify({
    id,
    args,
    executable: realpathSync(executable),
    version,
    cwd: process.cwd(),
  }) + '\n'
)
const env = { ...process.env }
if (args[0] === 'upgrade') {
  env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = version
}
const child = spawn(
  process.execPath,
  [
    '--import',
    pathToFileURL(join(tools, 'upstream.mjs')).href,
    executable,
    ...args,
  ],
  { stdio: ['inherit', 'pipe', 'pipe'], env }
)
for (const stream of ['stdout', 'stderr']) {
  child[stream].on('data', (data) => {
    process[stream].write(data)
    appendFileSync(
      join(tools, 'commands.jsonl'),
      JSON.stringify({ id, args, version, stream, text: data.toString() }) +
        '\n'
    )
  })
}
child.on('error', (error) => {
  throw error
})
child.on('close', (code, signal) => {
  appendFileSync(
    join(tools, 'commands.jsonl'),
    JSON.stringify({ id, args, version, exitCode: code, signal }) + '\n'
  )
  process.exitCode = code ?? 1
})
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal))
}
