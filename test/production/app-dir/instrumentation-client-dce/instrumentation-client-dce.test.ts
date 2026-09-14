import { nextTestSetup } from 'e2e-utils'

// The router transition instrumentation only emits the rich transition event
// (which carries `fromRoutes`) when the experimental flag is enabled. That code
// path is gated behind `process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS`,
// which is replaced with a literal at build time so the disabled path can be
// dead-code-eliminated. `fromRoutes` is the marker: in client runtime code it
// appears only inside that gated branch, and object keys survive minification.
describe('instrumentation client router transition events - dead code elimination', () => {
  describe('when the experimental flag is enabled', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: { instrumentationClientRouterTransitionEvents: true },
      },
    })
    if (skipped) return

    it('keeps the transition event payload in the client bundle', async () => {
      const $ = await next.render$('/')
      const chunkContents = await Promise.all(
        $('script[src]')
          .toArray()
          .map((el) => next.fetch($(el).attr('src')).then((res) => res.text()))
      )

      expect(
        chunkContents.some((content) => content.includes('fromRoutes'))
      ).toBe(true)
    })
  })

  describe('when the experimental flag is disabled', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
    })
    if (skipped) return

    it('removes the transition event payload from the client bundle', async () => {
      const $ = await next.render$('/')
      const chunkContents = await Promise.all(
        $('script[src]')
          .toArray()
          .map((el) => next.fetch($(el).attr('src')).then((res) => res.text()))
      )

      expect(
        chunkContents.some((content) => content.includes('fromRoutes'))
      ).toBe(false)
    })
  })
})
