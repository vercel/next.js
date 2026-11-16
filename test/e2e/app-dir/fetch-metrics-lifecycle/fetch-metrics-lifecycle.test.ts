import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

// These assertions inspect local CLI output and build diagnostics.
// @force-gate !deploy
describe.each(['0', '1'])(
  'fetch metrics (NEXT_SSG_FETCH_METRICS=%s)',
  (enabled) => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      env: {
        NEXT_SSG_FETCH_METRICS: enabled,
        NEXT_DEBUG_BUILD: '',
      },
    })

    function expectMetrics(
      output: string,
      id: string,
      trackingDuringRender: boolean,
      trackingAfterClose: boolean,
      allowValidationRender = false
    ) {
      const records = output
        .split('\n')
        .filter((line) => line.includes('FETCH_METRICS '))
        .map((line) => JSON.parse(line.split('FETCH_METRICS ')[1]))
        .filter((entry) => entry.id === id)
      // Dev Cache Components prepares background validation with another render
      // after response close. Its after() log can race with the original render.
      // Keep production assertions strict for every render.
      const record = allowValidationRender
        ? records.find(
            (entry) => entry.trackingDuringRender === trackingDuringRender
          )
        : records[0]
      expect(record).toBeDefined()
      expect(record.trackingDuringRender).toBe(trackingDuringRender)

      if (trackingDuringRender) {
        expect(record.urlsBefore).toContain(`data:text/plain,render-${id}`)
      } else {
        expect(record.urlsBefore).toEqual([])
      }
      for (const entry of records) {
        if (!allowValidationRender) {
          expect(entry.trackingDuringRender).toBe(trackingDuringRender)
        }
        expect(entry.trackingAfterClose).toBe(trackingAfterClose)
        if (trackingAfterClose) {
          expect(entry.urlsAfter).toContain(`data:text/plain,after-${id}`)
        } else {
          expect(entry.urlsAfter).toEqual(entry.urlsBefore)
        }
      }
    }

    // @force-gate !dev
    it('tracks build-time fetches through after() when metrics are enabled', async () => {
      expectMetrics(next.cliOutput, 'build', enabled === '1', enabled === '1')
      if (enabled === '1') {
        const metrics = await next.readJSON(
          '.next/diagnostics/fetch-metrics.json'
        )
        expect(metrics['/build']).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ url: 'data:text/plain,render-build' }),
            expect.objectContaining({ url: 'data:text/plain,after-build' }),
          ])
        )
      }
    })

    it('stops tracking runtime prerender fetches when the response closes', async () => {
      // Cache Components resumes unknown params as a dynamic render, which does
      // not collect production fetch metrics.
      const cacheComponents = await gate((c) => c.cacheComponents)
      const tracksPrerenderMetrics = enabled === '1' && !cacheComponents
      const outputIndex = next.cliOutput.length
      const response = await next.fetch('/runtime')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('runtime')
      await retry(() => {
        expectMetrics(
          next.cliOutput.slice(outputIndex),
          'runtime',
          isNextDev || tracksPrerenderMetrics,
          false,
          isNextDev && cacheComponents
        )
      })
    })

    it('tracks dynamic renders only in development and stops on close', async () => {
      const outputIndex = next.cliOutput.length
      const response = await next.fetch('/dynamic')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('dynamic')
      await retry(() => {
        expectMetrics(
          next.cliOutput.slice(outputIndex),
          'dynamic',
          isNextDev,
          false
        )
      })
    })
  }
)
