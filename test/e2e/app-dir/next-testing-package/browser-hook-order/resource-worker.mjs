import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { assertHookRows } from './assertions.mjs'
const [nextRoot, fixture, output, browser, mode, kind, order, limit] =
    process.argv.slice(2),
  require = createRequire(path.join(nextRoot, 'package.json'))
const { createTestCompilerSession } = require(
    path.join(nextRoot, 'dist/experimental/testing/compiler')
  ),
  { executeClient } = require(
    path.join(nextRoot, 'dist/experimental/testing/client/execute')
  )
const profile = {
    id: 'actual-hook-resource',
    mode,
    environment: 'browser',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  },
  entry = {
    id: 'actual-hook-resource-entry',
    file: path.join(fixture, 'hooks.test.mjs'),
    profile,
  },
  controller = new AbortController(),
  user = new AbortController(),
  events = []
let compiler,
  result,
  ready = 0
try {
  compiler = await createTestCompilerSession(fixture, profile)
  const artifact = await compiler.compile(entry, { signal: controller.signal })
  assert.equal(artifact.kind, 'browser')
  result = await executeClient(artifact, {
    entry,
    runId: 'actual-hook-resource-run',
    projectDir: fixture,
    setupFiles: [],
    signal: controller.signal,
    ...(kind === 'user-cancel' ? { userCancelSignal: user.signal } : {}),
    testFrame: true,
    browserEngine: browser,
    browserHeadless: true,
    captureTaskResults: true,
    captureCompletedModuleResult: true,
    snapshotUpdateMode: 'none',
    testTimeout: 1000,
    hookTimeout: 1000,
    fileTimeout: 60000,
    sequence: { hooks: order },
    ...(limit === '1' ? { maxConcurrency: 1 } : {}),
    onEvent(event) {
      events.push(event)
      if (
        kind === 'user-cancel' &&
        event.type === 'output' &&
        event.text.includes('HOOK_CANCEL_READY')
      ) {
        ready++
        user.abort('keyboard-input')
      }
    },
  })
} finally {
  await compiler?.dispose()
}
const prefix =
    kind === 'user-cancel' ? 'HOOK_CANCEL_ROWS:' : 'HOOK_DEADLINE_ROWS:',
  rows = events
    .filter((e) => e.type === 'output')
    .flatMap((e) =>
      e.text
        .split('\n')
        .filter((l) => l.startsWith(prefix))
        .map((l) => JSON.parse(l.slice(prefix.length)))
    ),
  cases = events
    .filter((e) => e.type === 'case-end')
    .map((e) => ({ name: e.name, status: e.status, errors: e.errors }))
assertHookRows({ kind, order, limit: limit === '1' ? 1 : null }, rows)
assert.equal(events.filter((event) => event.type === 'diagnostic').length, 0)
assert.equal(cases.length, 1)
assert.equal(result.moduleExecution?.completion?.kind, 'fulfilled')
if (kind === 'user-cancel') {
  assert.equal(ready, 1)
  assert.equal(user.signal.aborted, true)
  assert.equal(result.closedUserCancellation, true)
  assert.equal(result.status, 'passed')
  assert.equal(cases[0].name, 'actual user cancellation during parallel hooks')
  assert.equal(cases[0].status, 'passed')
  assert.deepEqual(cases[0].errors, [])
} else {
  assert.equal(ready, 0)
  assert.equal(user.signal.aborted, false)
  assert.equal(result.closedUserCancellation, undefined)
  assert.equal(result.status, 'failed')
  assert.equal(cases[0].name, 'actual hook deadline and released resource')
  assert.equal(cases[0].status, 'failed')
  assert.equal(cases[0].errors.length, 1)
  const diagnostic = cases[0].errors[0]
  assert.equal(diagnostic.name, 'Error')
  assert.match(diagnostic.message, /^Hook timed out in 20ms\./)
  assert.equal(diagnostic.phase, 'runtime')
  assert.equal(diagnostic.severity, 'error')
  assert(
    diagnostic.frames.some(
      (frame) =>
        frame.file === path.join(fixture, 'hooks.test.mjs') &&
        frame.line === 7 &&
        frame.original === true
    )
  )
}
fs.writeFileSync(
  path.join(output, 'actual.json'),
  JSON.stringify({
    kind,
    order,
    cases: cases.length,
    rows: rows.flat().length,
    behaviorAssertions: true,
    compilerDisposed: true,
  }) + '\n'
)
