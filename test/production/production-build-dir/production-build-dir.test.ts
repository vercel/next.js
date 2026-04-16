import { nextTestSetup } from 'e2e-utils'

describe('Production Custom Build Directory', () => {
  describe('production mode', () => {
    const { next, isNextStart } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should render the page', async () => {
      const result = await next.build()
      expect(result.exitCode).toBe(0)

      await next.start()
      const html = await next.render('/')
      expect(html).toMatch(/Hello World/)
    })
  })
})
