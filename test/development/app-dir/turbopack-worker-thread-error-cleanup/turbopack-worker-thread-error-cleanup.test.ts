import { wait } from 'next/dist/lib/wait'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('turbopack worker thread error cleanup', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const itOnlyTurbopack = isTurbopack ? it : it.skip

  itOnlyTurbopack(
    'terminates a loader worker after an evaluation error',
    async () => {
      expect((await next.render$('/'))('p').text()).toBe('initial')

      await next.patchFile('input.probe', 'throw')
      await wait(1000)
      await next.fetch('/')
      await retry(async () => {
        expect(next.cliOutput).toContain('EXPECTED_WORKER_THREAD_LOADER_ERROR')
      }, 30_000)

      // The failing loader schedules this marker before throwing. A worker that
      // is merely removed from the pool remains alive and writes it later.
      await wait(2000)
      expect(await next.hasFile('worker-survived.txt')).toBe(false)

      await next.patchFile('input.probe', 'recovered')
      await retry(async () => {
        expect((await next.render$('/'))('p').text()).toBe('recovered')
      })
    }
  )
})
