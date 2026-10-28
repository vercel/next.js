import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [role, input, expectation, output] = process.argv.slice(2)
if (role !== 'actual') {
  const result = await runOwnedNode(
    [new URL(import.meta.url).pathname, 'actual', role, input, expectation],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'development' },
      auditDir: expectation + '.owners',
      timeoutMs: 30000,
    }
  )
  writeFileSync(
    expectation + '.result.json',
    JSON.stringify(result, null, 2) + '\n'
  )
  assertOwnedNodeCompleted(
    result,
    'actual snapshot preparation CLI admission ' + role
  )
  assert.equal(result.status, 0, result.stderr)
} else {
  const require = createRequire(import.meta.url)
  require('next/dist/server/node-environment-baseline')
  const specification = JSON.parse(input),
    reporter = specification.reporter,
    expected = expectation === 'true',
    directory = mkdtempSync(join(tmpdir(), 'next-snapshot-cli-role-'))
  let invoked = 0,
    cacheConstructors = 0,
    cacheReads = 0,
    forwarded
  const cacheFile = require.resolve(
    'next/dist/experimental/testing/result-cache'
  )
  const originalCache = require(cacheFile)
  const previousCache = require.cache[cacheFile]
  class ObservedCache extends originalCache.TestResultCache {
    constructor(...args) {
      super(...args)
      cacheConstructors++
    }
    async read() {
      cacheReads++
      return super.read()
    }
  }
  require.cache[cacheFile] = {
    id: cacheFile,
    filename: cacheFile,
    loaded: true,
    exports: { ...originalCache, TestResultCache: ObservedCache },
  }
  const file = require.resolve('next/dist/experimental/testing/orchestrator'),
    previous = require.cache[file]
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: {
      async runTests(root, projects, options) {
        invoked++
        forwarded = options.preparePublicSnapshots
        assert.equal(
          typeof options.onSnapshotPreparationFailure,
          expected ? 'function' : 'undefined'
        )
        const envelope = { version: 1, runId: 'owned-run', timestamp: 1 },
          entry = projects[0].entries[0]
        options.onEvent({ ...envelope, type: 'run-start' })
        options.onEvent({
          ...envelope,
          type: 'file-start',
          entry,
          revision: 'owned-revision',
        })
        options.onEvent({
          ...envelope,
          type: 'file-end',
          entryId: entry.id,
          status: 'passed',
          durationMs: 1,
        })
        options.onEvent({
          ...envelope,
          type: 'run-end',
          status: 'passed',
          durationMs: 1,
        })
        return {
          runId: envelope.runId,
          status: 'passed',
          unsafeCleanup: false,
          files: { passed: 1, failed: 0, skipped: 0, cancelled: 0 },
          cases: { passed: 0, failed: 0, skipped: 0, cancelled: 0 },
          durationMs: 1,
          annotations: 0,
          attachments: 0,
          snapshots: [],
        }
      },
    },
  }
  try {
    writeFileSync(
      join(directory, 'next.test.config.json'),
      JSON.stringify({
        test: {
          include: ['owned.case.mjs'],
          ...(specification.authoredCache === undefined
            ? {}
            : { cache: specification.authoredCache }),
          mode: specification.mode,
          environment: 'node',
        },
      })
    )
    writeFileSync(
      join(directory, 'owned.case.mjs'),
      "import {test} from 'vitest'; test('owned',()=>{})\n"
    )
    writeFileSync(join(directory, 'reporter.mjs'), 'export default class {}\n')
    const { nextTestRunner } = require('next/dist/cli/next-test-runner')
    await nextTestRunner(directory, {
      run: true,
      cacheDefault: true,
      ...(specification.cliCache === undefined
        ? {}
        : { cache: specification.cliCache }),
      ...(reporter ? { reporter } : {}),
    })
    assert.equal(invoked, 1)
    assert.equal(forwarded, expected ? true : undefined)
    assert.equal(cacheConstructors, specification.cached ? 1 : 0)
    assert.equal(cacheReads, specification.cached ? 1 : 0)
    writeFileSync(
      output,
      JSON.stringify(
        {
          reporter,
          expected,
          actualCLIForwarded: true,
          actualCacheConstructors: cacheConstructors,
          actualCacheReads: cacheReads,
          customNeverCreatesCache:
            !reporter?.some((name) => name.startsWith('.')) ||
            cacheConstructors === 0,
          cachedJsonDefaultRoleRemainsAbsent:
            !specification.cached || forwarded === undefined,
          execPath: process.execPath,
          version: process.version,
          versions: process.versions,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    if (previousCache) require.cache[cacheFile] = previousCache
    else delete require.cache[cacheFile]
    if (previous) require.cache[file] = previous
    else delete require.cache[file]
    rmSync(directory, { recursive: true, force: true })
  }
}
