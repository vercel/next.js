import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type Report = { id: string; urls: string[] }

function reports(output: string): Report[] {
  return Array.from(output.matchAll(/FETCH_METRICS (\{[^\n]+\})/g), (match) =>
    JSON.parse(match[1])
  )
}

// Retained metrics and local build diagnostics are specific to the Node server.
// @force-gate !deploy
describe('fetch metrics lifecycle', () => {
  for (const logging of [true, false]) {
    describe(`logging=${logging}`, () => {
      const { next, isNextDev } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          cacheComponents: false,
          logging: logging ? { fetches: { fullUrl: true } } : false,
        },
        env: { NEXT_SSG_FETCH_METRICS: '1' },
      })

      it('stops collecting page and route metrics after response close', async () => {
        const outputIndex = next.cliOutput.length
        await Promise.all(
          ['/dynamic-page', '/dynamic-route'].map(async (pathname) => {
            const response = await next.fetch(pathname)
            expect(response.status).toBe(200)
            await response.text()
          })
        )

        await retry(async () => {
          const output = reports(next.cliOutput.slice(outputIndex))
          for (const id of ['dynamic-page', 'dynamic-route']) {
            expect(output.find((report) => report.id === id)).toEqual({
              id,
              urls: isNextDev ? [`data:text/plain,${id}-render`] : [],
            })
          }
        })

        const output = next.cliOutput.slice(outputIndex)
        for (const id of ['dynamic-page', 'dynamic-route']) {
          const renderLog = `GET data:text/plain,${id}-render`
          if (isNextDev && logging) {
            expect(output).toContain(renderLog)
          } else {
            expect(output).not.toContain(renderLog)
          }
          expect(output).not.toContain(`GET data:text/plain,${id}-after`)
        }
      })

      it('preserves prerender metrics through their reporting lifetime', async () => {
        if (isNextDev) {
          const outputIndex = next.cliOutput.length
          await next.fetch('/').then((response) => response.text())
          await retry(async () => {
            expect(reports(next.cliOutput.slice(outputIndex))).toContainEqual({
              id: 'build',
              urls: ['data:text/plain,build-render'],
            })
          })
        } else {
          const diagnostics = JSON.parse(
            await next.readFile('.next/diagnostics/fetch-metrics.json')
          )
          expect(
            diagnostics['/'].map((metric: { url: string }) => metric.url)
          ).toEqual([
            'data:text/plain,build-render',
            'data:text/plain,build-after',
          ])

          const outputIndex = next.cliOutput.length
          await next.fetch('/isr/runtime').then((response) => response.text())
          await retry(async () => {
            expect(reports(next.cliOutput.slice(outputIndex))).toContainEqual({
              id: 'isr-runtime',
              urls: ['data:text/plain,isr-runtime-render'],
            })
          })

          const regenerationIndex = next.cliOutput.length
          await retry(async () => {
            const response = await next.fetch('/isr/runtime')
            await response.text()
            expect(response.headers.get('x-nextjs-cache')).toBe('STALE')
          })
          await retry(async () => {
            const regenerated = reports(next.cliOutput.slice(regenerationIndex))
            expect(regenerated.length).toBeGreaterThan(0)
            for (const report of regenerated) {
              expect(report.urls).not.toContain(
                'data:text/plain,isr-runtime-after'
              )
            }
          })
        }
      })
    })
  }
})
