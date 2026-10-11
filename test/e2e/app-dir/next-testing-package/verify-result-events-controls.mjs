import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Synthetic harness controls; these do not claim compiler/runtime acceptance.
const directory = mkdtempSync(join(tmpdir(), 'next-test-event-controls-'))
const preload = join(
  dirname(fileURLToPath(import.meta.url)),
  'result-events.cjs'
)
try {
  const next = join(directory, 'node_modules/next')
  mkdirSync(join(next, 'dist/bin'), { recursive: true })
  mkdirSync(join(next, 'dist/experimental/testing'), { recursive: true })
  writeFileSync(join(directory, 'package.json'), '{}')
  writeFileSync(join(next, 'package.json'), '{"name":"next"}')
  for (const [module, name, index] of [
    ['orchestrator', 'runTests', 2],
    ['watch-orchestrator', 'watchTests', 1],
  ]) {
    writeFileSync(
      join(next, `dist/experimental/testing/${module}.js`),
      `
      const calls = exports.calls = []
      const run = function (...args) {
        calls.push({ receiver: this, args })
        args[${index}].onEvent({ version: 1, runId: '${name}', timestamp: 1, type: 'run-start' })
        return args[${index + 1}]
      }
      Object.defineProperty(exports, '${name}', { enumerable: true, get: () => run })
    `
    )
  }
  const worker = join(directory, 'worker.cjs')
  writeFileSync(
    worker,
    `
    const assert = require('node:assert/strict')
    const moduleValue = require('next/dist/experimental/testing/orchestrator')
    const options = { onEvent() {} }
    moduleValue.runTests('.', [], options)
    assert.equal(moduleValue.calls[0].args[2], options, 'Descendants must not be instrumented')
  `
  )
  const cli = join(next, 'dist/bin/next')
  writeFileSync(
    cli,
    `
    const assert = require('node:assert/strict')
    const { spawnSync } = require('node:child_process')
    for (const [path, name, index] of [
      ['orchestrator', 'runTests', 2],
      ['watch-orchestrator', 'watchTests', 1],
    ]) {
      const moduleValue = require('next/dist/experimental/testing/' + path)
      const receiver = {}
      const projects = [{ entries: ['fixture.ts'] }]
      const result = {}
      const extra = {}
      const signal = new AbortController().signal
      const writes = []
      let observed = 0
      const options = { signal, project: 'selected', write: (text) => writes.push(text), onEvent: () => observed++ }
      const callback = options.onEvent
      const args = index === 2 ? ['project-directory', projects, options, result, extra] : ['project-directory', options, result, extra]
      assert.equal(moduleValue[name].apply(receiver, args), result)
      const call = moduleValue.calls[0]
      assert.equal(call.receiver, receiver)
      assert.equal(call.args.length, args.length)
      for (let i = 0; i < args.length; i++) {
        if (i !== index) assert.equal(call.args[i], args[i], 'Every non-options argument must retain identity')
      }
      assert.equal(call.args[index].signal, signal)
      assert.equal(call.args[index].write, options.write)
      assert.equal(call.args[index].project, 'selected')
      assert.equal(options.onEvent, callback, 'Original options must not be mutated')
      assert.equal(observed, 1, 'Original onEvent must be chained exactly once')
    }
    const child = spawnSync(process.execPath, [${JSON.stringify(worker)}], { encoding: 'utf8', env: process.env })
    assert.equal(child.status, 0, child.stderr)
  `
  )
  const native = join(directory, 'native-audit.cjs')
  const nativeLog = join(directory, 'native.jsonl')
  writeFileSync(
    native,
    `require('node:fs').appendFileSync(${JSON.stringify(nativeLog)}, 'loaded\\n')`
  )
  const eventLog = join(directory, 'events.jsonl')
  const result = spawnSync(process.execPath, [cli], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `--require=${JSON.stringify(native)} --import=${JSON.stringify(pathToFileURL(preload).href)}`,
      NEXT_TEST_EVENT_AUDIT: eventLog,
    },
    timeout: 10000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(nativeLog, 'utf8'), 'loaded\nloaded\n')
  assert.deepEqual(
    readFileSync(eventLog, 'utf8').trim().split('\n').map(JSON.parse),
    ['runTests', 'watchTests'].map((runId) => ({
      version: 1,
      runId,
      timestamp: 1,
      type: 'run-start',
    }))
  )
  console.log('CLI result event preload controls passed')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
