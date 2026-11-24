import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { NextDeployInstance } from '../../../lib/next-modes/next-deploy'

describe.each([false, true])('partialPrefetching: %s', (partialPrefetching) => {
  describe.each([false, true])('OpenTelemetry enabled: %s', (enabled) => {
    const { next, isNextDev, isNextDeploy } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@opentelemetry/api': '1.9.1',
        '@opentelemetry/sdk-node': '0.208.0',
      },
      env: {
        ENABLE_OTEL: enabled ? '1' : '0',
        PARTIAL_PREFETCHING: partialPrefetching ? '1' : '0',
      },
    })

    function captureOutput() {
      const since = new Date()
      const outputIndex = next.cliOutput.length
      const deadline = Date.now() + 50_000
      return () =>
        isNextDeploy
          ? (next as NextDeployInstance).getRuntimeLogs({ since, deadline })
          : Promise.resolve(next.cliOutput.slice(outputIndex))
    }

    it('allows span-end metrics while rendering and revalidating cached content', async () => {
      const output = captureOutput()
      const first = await next.render$('/otel-span-end/item/built')
      const cached = first('#cached').text()
      expect(cached).toMatch(/^built: /)
      expect(first('#request').text()).toBe('Request-time content')
      const second = await next.render$('/otel-span-end/item/built')
      expect(second('#cached').text()).toBe(cached)

      const revalidation = await next.fetch('/otel-span-end/revalidate', {
        method: 'POST',
      })
      expect(revalidation.status).toBe(200)

      // A fresh response does not mean revalidation has settled. Retry both
      // reads together so cache reuse is checked against the current value.
      await retry(async () => {
        const $ = await next.render$('/otel-span-end/item/built')
        const updated = $('#cached').text()
        expect(updated).toMatch(/^built: /)
        expect(updated).not.toBe(cached)
        expect($('#request').text()).toBe('Request-time content')

        const again = await next.render$('/otel-span-end/item/built')
        expect(again('#cached').text()).toBe(updated)
      })

      for (const kind of ['manual', 'active']) {
        const $ = await next.render$(`/otel-span-end/item/${kind}`)
        expect($('#cached').text()).toMatch(new RegExp(`^${kind}: `))
        expect($('#request').text()).toBe('Request-time content')
      }

      await retry(
        async () => {
          const logs = await output()
          expect(logs).not.toContain('encountered the unstable value')
          if (enabled) {
            const spans = [...logs.matchAll(/SPAN_END:(\{[^\n]+\})/g)].map(
              (match) => JSON.parse(match[1])
            )
            expect(spans).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ type: expect.any(String) }),
                ...['manual', 'active'].map((kind) =>
                  expect.objectContaining({
                    name: `otel-span-end-${kind}`,
                    before: expect.any(Number),
                    after: expect.any(Number),
                    random: expect.any(Number),
                    date: expect.any(String),
                  })
                ),
              ])
            )
          }
        },
        isNextDeploy ? 50_000 : 5000
      )
    })

    it('still validates application clock reads inside startActiveSpan', async () => {
      const output = captureOutput()
      const $ = await next.render$('/otel-span-end/clock/novel')
      expect($('#clock').text()).toMatch(/^\d+$/)

      // With Partial Prefetching disabled, production does not attempt to
      // prerender the concrete runtime params. Dev still validates the render.
      if (isNextDev || partialPrefetching) {
        await retry(
          async () => {
            const logs = await output()
            expect(logs).toContain('/otel-span-end/clock/[slug]')
            expect(logs).toMatch(/unstable value.*Date\.now\(\)/)
          },
          isNextDeploy ? 50_000 : 5000
        )
      }
    })
  })
})
