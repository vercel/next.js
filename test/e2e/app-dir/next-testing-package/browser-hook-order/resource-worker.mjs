import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
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
  fs.writeFileSync(
    path.join(output, 'events.json'),
    JSON.stringify(events, null, 2) + '\n'
  )
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
fs.writeFileSync(
  path.join(output, 'actual.json'),
  JSON.stringify(
    {
      result,
      rows,
      cases,
      ready,
      userAborted: user.signal.aborted,
      compilerDisposed: true,
      diagnostics: events
        .filter((e) => e.type === 'diagnostic')
        .map((e) => e.diagnostic),
    },
    null,
    2
  ) + '\n'
)
