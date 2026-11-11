import assert from 'node:assert/strict'
import { it } from 'node:test'

// The Jest wrapper supplies resolved modules to a fresh Node process so the
// actual C/D assertion runtime never shares Jest's matcher globals.
const { initializeTestFile, getActiveAttempt } = require(
  process.argv[2]
) as typeof import('next/dist/experimental/testing/runner')
const { browser, initializeBrowserTesting } = require(
  process.argv[3]
) as typeof import('next/dist/experimental/testing/browser')

for (const phase of ['before facade disposal', 'after facade disposal']) {
  it(`records a caught browser call from a closed C attempt ${phase}`, async () => {
    const runner = initializeTestFile({
      fileId: 'late-browser-file',
      filePath: __filename,
    })
    let fixtureCalls = 0
    const binding = initializeBrowserTesting({
      getActiveAttempt,
      async createFixture() {
        fixtureCalls++
        throw new Error('A closed attempt must not create a browser fixture')
      },
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let continuation: Promise<unknown> | undefined
    const failures: Error[] = []
    try {
      await runner.collect(async () => {
        runner.api.test('browser origin', () => {
          continuation = gate
            .then(() => browser())
            .catch((error: unknown) => error)
        })
      })
      const result = await runner.run({
        runId: 'late-browser-run',
        signal: new AbortController().signal,
        onLateFailure(error) {
          failures.push(error)
        },
      })
      await runner.dispose()
      if (phase === 'after facade disposal') binding.dispose()
      release()
      const caught = await continuation
      assert.ok(caught instanceof Error)
      assert.match(caught.message, /closed attempt scope "browser origin"/)
      assert.ok(caught.message.includes(result.cases[0].attempt.id))
      assert.deepEqual(failures, [caught])
      // C's sealed case remains immutable. B consumes the retained late sink
      // to fail the file even though the originating callback caught its error.
      assert.equal(result.cases[0].status, 'passed')
      assert.deepEqual(result.cases[0].errors, [])
      assert.equal(fixtureCalls, 0)
      binding.dispose()
      assert.throws(
        () => browser(),
        /initialized Next browser test environment/
      )
      assert.equal(fixtureCalls, 0)
    } finally {
      release()
      await continuation
      binding.dispose()
      await runner.dispose()
    }
  })
}
