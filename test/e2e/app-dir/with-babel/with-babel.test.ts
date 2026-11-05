import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

// @force-gate !futureCompat || !start || turbopack
describe('with babel', () => {
  const { next, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should support babel in app dir', async () => {
    if (
      await gate(
        (conditions) =>
          conditions.futureCompat && conditions.dev && conditions.rspack
      )
    ) {
      await expect(next.fetch('/')).rejects.toThrow('fetch failed')
      await retry(() => {
        expect(next.cliOutput).toContain('DEP0111')
        expect(next.cliOutput).toContain('process.binding()')
      })
      return
    }
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('hello')
  })

  if (isNextStart) {
    // Turbopack always runs SWC, so this shouldn't be an issue, but this test
    // refers to a webpack-specific output path.
    // https://github.com/vercel/next.js/pull/51067
    ;(isTurbopack ? it.skip : it)(
      'should contain og package files in middleware',
      async () => {
        await retry(async () => {
          const middleware = await next.readFile('.next/server/middleware.js')
          // @vercel/og default font should be bundled
          expect(middleware).not.toContain('Geist-Regular.ttf')
        })
      }
    )
  }
})
