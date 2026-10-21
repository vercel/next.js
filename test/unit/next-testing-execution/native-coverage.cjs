const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const base = process.argv[2]
const mode = process.argv[3]
const extraRejection = [
  'during-capture',
  'after-capture',
  'same-error-after-capture',
  'post-receipt',
].includes(mode)
const validWorkerCapture = ![
  'during-capture',
  'after-capture',
  'same-error-after-capture',
].includes(mode)
const { executeWithEnvironment } = require(path.join(base, 'execution/execute'))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function main() {
  const rootDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'next-native-capture-'))
  )
  try {
    for (const [source, target] of [
      ['native-coverage-entry.cjs', 'entry.cjs'],
      ['native-coverage-preload.cjs', 'preload.cjs'],
    ])
      await fs.copyFile(
        path.join(__dirname, source),
        path.join(rootDir, target)
      )
    await fs.writeFile(
      path.join(rootDir, 'runtime-paths.json'),
      JSON.stringify({
        runner: path.join(base, 'runner'),
        vitest: path.join(base, 'vitest'),
      })
    )
    const scripts = []
    for (const file of ['entry.cjs', 'preload.cjs'])
      scripts.push({
        path: file,
        sha256: sha(await fs.readFile(path.join(rootDir, file))),
      })
    const profile = {
      id: 'native',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    const entry = {
      id: 'native:capture',
      file: path.join(rootDir, 'spec.ts'),
      profile,
    }
    await fs.writeFile(entry.file, '// Owned host component probe.\n')
    const artifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      profile,
      revision: 'capture',
      rootDir,
      entryPath: 'entry.cjs',
      files: ['entry.cjs', 'preload.cjs', 'runtime-paths.json'],
      diagnostics: [],
      coverage: { version: 1, scripts, sources: {} },
    }
    const events = [],
      completions = []
    let rejectedReceipt = false
    const result = await executeWithEnvironment(
      artifact,
      {
        runId: 'native-capture',
        projectDir: rootDir,
        entry,
        setupFiles: [],
        testTimeout: 1000,
        hookTimeout: 1000,
        fileTimeout: 10000,
        coverage: { version: 1, kind: 'node-line' },
        signal: new AbortController().signal,
        onEvent(event) {
          events.push(event)
        },
        async onCoverage(value) {
          completions.push(value)
        },
      },
      {
        ...process.env,
        NODE_ENV: 'development',
        NODE_OPTIONS: '--require ' + path.join(rootDir, 'preload.cjs'),
        NEXT_TEST_CAPTURE_RUNTIME: base,
        NEXT_TEST_CAPTURE_MODE: mode,
        NEXT_TEST_CAPTURE_TRACE: path.join(rootDir, 'trace.jsonl'),
      }
    ).catch((error) => {
      assert.equal(mode, 'mismatched-receipt')
      assert.equal(error.message, 'Mismatched test worker coverage completion')
      rejectedReceipt = true
      return { status: 'failed' }
    })
    assert.equal(rejectedReceipt, mode === 'mismatched-receipt')
    const trace = (await fs.readFile(path.join(rootDir, 'trace.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse)
    if (process.argv[4]) {
      await fs.mkdir(process.argv[4], { recursive: true })
      await fs.writeFile(
        path.join(process.argv[4], mode + '.json'),
        JSON.stringify(
          { mode, result, trace, events, completions, rejectedReceipt },
          null,
          2
        ) + '\n'
      )
    }
    assert.equal(result.status, 'failed')
    assert.equal(trace.filter((row) => row.event === 'captured').length, 1)
    assert.equal(
      trace.filter((row) => row.event === 'native').length,
      extraRejection ? 2 : 1
    )
    const terminal = trace.find((row) => row.event === 'terminal')
    assert(terminal)
    assert.equal(terminal.coverageComplete, validWorkerCapture)
    assert.equal(
      completions.length,
      mode === 'body' ? 1 : 0,
      JSON.stringify({
        trace,
        diagnostics: events.filter((event) => event.type === 'diagnostic'),
      })
    )
    if (mode === 'body') {
      assert.equal(completions[0].complete, true)
      assert.equal(completions[0].data.scripts.length, 2)
    }
    if (mode === 'same-error-after-capture') {
      assert(
        trace
          .filter((row) => row.event === 'native')
          .every((row) => row.sameError)
      )
      assert.equal(
        events.filter(
          (event) =>
            event.type === 'diagnostic' &&
            event.diagnostic.unhandled === 'rejection'
        ).length,
        1
      )
    }
    for (const script of scripts)
      assert.equal(
        sha(await fs.readFile(path.join(rootDir, script.path))),
        script.sha256
      )
    console.log(
      JSON.stringify({
        mode,
        realInspectorCapture: true,
        actualNativeEvents: extraRejection ? 2 : 1,
        coveragePublished: mode === 'body',
        sourceHashesHeld: true,
      })
    )
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
