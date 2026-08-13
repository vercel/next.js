import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('turbopack worker thread crash recovery', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const itOnlyTurbopack = isTurbopack ? it : it.skip

  itOnlyTurbopack(
    'fails the evaluation instead of hanging when a loader worker dies, and recovers',
    async () => {
      expect((await next.render$('/'))('p').text()).toBe('initial')

      // The loader calls process.exit(1), killing the worker thread before it
      // reports the evaluation result. Without worker-death reaping this
      // request would hang forever.
      await next.patchFile('input.crashprobe', 'exit-during-eval')
      await waitFor(1500)

      // Trigger the evaluation. It fails the compile rather than hanging.
      await next.fetch('/')

      await retry(
        async () => {
          expect(next.cliOutput).toContain(
            'Node.js subprocess crashed while evaluating'
          )
        },
        30_000,
        500
      )

      // The pool must hand out a fresh worker after the crash: a new
      // evaluation with a working probe succeeds.
      await next.patchFile('input.crashprobe', 'recovered')
      await retry(async () => {
        expect((await next.render$('/'))('p').text()).toBe('recovered')
      })
    },
    60_000
  )
})
