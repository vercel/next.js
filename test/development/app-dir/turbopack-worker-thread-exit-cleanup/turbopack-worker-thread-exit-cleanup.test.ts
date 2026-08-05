import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('turbopack worker thread exit cleanup', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const itOnlyTurbopack = isTurbopack ? it : it.skip

  itOnlyTurbopack(
    'reaps a worker that dies mid-evaluation and recovers on a fresh worker',
    async () => {
      expect((await next.render$('/'))('p').text()).toBe('initial')

      // The loader calls process.exit(1) mid-evaluation, killing the worker
      // thread. The dead worker must not wedge the task or be handed out
      // again: the compile must fail with a crash issue instead of hanging.
      await next.patchFile('input.probe', 'exit')
      // Give the filesystem watcher a moment to invalidate before the fetch,
      // so the loader actually reruns (and kills its worker thread).
      await waitFor(1000)
      await next.fetch('/')
      await retry(
        async () => {
          expect(next.cliOutput).toContain('crashed while evaluating')
        },
        30_000,
        500
      )

      // A later compile gets a fresh worker and the route recovers.
      await next.patchFile('input.probe', 'recovered')
      await retry(
        async () => {
          expect((await next.render$('/'))('p').text()).toBe('recovered')
        },
        30_000,
        500
      )
    }
  )
})
