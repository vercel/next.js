import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const [nextRoot, fixture, output, browser, mode, capture, prefix] =
  process.argv.slice(2)
const require = createRequire(path.join(nextRoot, 'package.json'))
const { createTestCompilerSession } = require(
  path.join(nextRoot, 'dist/experimental/testing/compiler')
)
const { executeClient } = require(
  path.join(nextRoot, 'dist/experimental/testing/client/execute')
)
const profile = {
  id: 'actual-browser-public-direct',
  mode,
  environment: 'browser',
  runtime: 'nodejs',
  bundler: 'turbopack',
  browserClient: true,
}
const entry = {
  id: 'actual-browser-public-direct-entry',
  file: path.join(fixture, 'queue.test.mjs'),
  profile,
}
const controller = new AbortController(),
  events = []
let compiler
try {
  compiler = await createTestCompilerSession(fixture, profile)
  const artifact = await compiler.compile(entry, { signal: controller.signal })
  assert.equal(artifact.kind, 'browser')
  const result = await executeClient(artifact, {
    entry,
    runId: 'actual-browser-public-direct-run',
    projectDir: fixture,
    setupFiles: [],
    signal: controller.signal,
    testFrame: true,
    browserEngine: browser,
    browserHeadless: true,
    browserViewport: { width: 640, height: 480 },
    captureTaskResults: true,
    ...(capture === 'true' ? { captureCompletedModuleResult: true } : {}),
    snapshotUpdateMode: 'none',
    testTimeout: 1000,
    hookTimeout: 1000,
    fileTimeout: 60000,
    onEvent(event) {
      events.push(event)
    },
  })
  const rows = events
    .filter((e) => e.type === 'output')
    .flatMap((e) =>
      e.text
        .split('\n')
        .filter((line) => line.startsWith(prefix))
        .map((line) => JSON.parse(line.slice(prefix.length)))
    )
  const cases = events
    .filter((e) => e.type === 'case-end')
    .map((e) => ({ name: e.name, status: e.status }))
  fs.writeFileSync(
    path.join(output, 'events.json'),
    JSON.stringify(events, null, 2) + '\n'
  )
  fs.writeFileSync(
    path.join(output, 'actual.json'),
    JSON.stringify(
      { result, rows, cases, captureRequested: capture === 'true' },
      null,
      2
    ) + '\n'
  )
  assert.equal(result.status, 'passed')
  if (capture === 'true') {
    assert.equal(result.moduleExecution?.completion?.kind, 'fulfilled')
    assert.equal(result.moduleExecution?.completion?.resultVersion, 2)
  } else assert.equal(result.moduleExecution, undefined)
} finally {
  await compiler?.dispose()
}
