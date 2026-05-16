import { nextTestSetup } from 'e2e-utils'

describe('next.config evaluation error', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    // `next.cliOutput` accumulates across builds in the same test process, so
    // we snapshot the length before each build and only assert against the
    // portion produced by that build. Otherwise framing produced by an earlier
    // test can mask a regression in a later one.
    async function buildAndGetOutput(): Promise<string> {
      const start = next.cliOutput.length
      await next.build()
      return next.cliOutput.slice(start)
    }

    it('should report a helpful error when the config function throws synchronously', async () => {
      await next.patchFile(
        'next.config.js',
        `
        module.exports = () => {
          // Reproduces a real customer report: a plugin allocates a typed
          // array that's too large and V8 itself throws RangeError from
          // inside the Uint8Array constructor. V8-thrown errors like this
          // tend to surface with the least context (no nice "at" frame in
          // the user's config), so it's the worst case for diagnosability.
          return { foo: new Uint8Array(5_000_000_000) }
        }
      `
      )
      const output = await buildAndGetOutput()

      expect(output).toContain('Invalid typed array length')
      expect(output).toContain(
        'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
    })

    it('should report a helpful error when the config module throws at the top level', async () => {
      await next.patchFile(
        'next.config.js',
        `
        // Same allocation crash, but at module evaluation time — before any
        // export is produced. Goes through a different throw site than the
        // function-call case above.
        const buf = new Uint8Array(5_000_000_000)
        module.exports = { foo: buf }
      `
      )
      const output = await buildAndGetOutput()

      expect(output).toContain('Invalid typed array length')
      expect(output).toContain(
        'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
    })

    it('should report a helpful error when the config function rejects', async () => {
      await next.patchFile(
        'next.config.js',
        `
        module.exports = async () => {
          throw new Error('boom from async config plugin')
        }
      `
      )
      const output = await buildAndGetOutput()

      expect(output).toContain('boom from async config plugin')
      expect(output).toContain(
        'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
    })

    // This is the exact failure mode reported by a customer: their plugin
    // kicked off async work (timer / setImmediate / un-awaited promise, or
    // an N-API thread-pool callback) from inside the config function that
    // crashed *after* the config function had already returned. The only
    // thing the user sees is:
    //
    //     uncaughtException RangeError: Invalid typed array length: ...
    //         at new Uint8Array (<anonymous>)
    //
    // with no mention of next.config.js, no docs link, and no frames pointing
    // at user code beyond the throw site itself. The banner comes from
    // packages/next/src/lib/setup-exception-listeners.ts.
    //
    // This case is intentionally left as `.todo`: the in-process try/catch in
    // loadConfig can't see this throw because it fires after loadConfig has
    // already returned. A fix needs a scoped uncaughtException handler around
    // loadConfig, which is a separate, larger change that benefits from more
    // data from real customer reports before designing.
    it.todo(
      'should report a helpful error when a config plugin throws async,' +
        ' after the config function returns'
    )
  })
})
