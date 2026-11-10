import { nextTestSetup } from 'e2e-utils'

describe('Production Custom Build Directory', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should render the page', async () => {
      const result = await next.build()
      expect(result.exitCode).toBe(0)

      await next.start()
      const html = await next.render('/')
      expect(html).toMatch(/Hello World/)
    })
  })
})
