import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely mutates files in the isolated local fixture after setup.
// @force-gate !deploy
describe('app dir - not-found - conflict route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const runTests = () => {
    it('should use the not-found page for non-matching routes', async () => {
      const browser = await next.browser('/random-content')
      expect(await browser.elementByCss('h1').text()).toContain(
        'This Is The Not Found Page'
      )
      // should contain root layout content
      expect(await browser.elementByCss('#layout-nav').text()).toBe('Navbar')
    })

    it('should allow to have a valid /not-found route', async () => {
      const html = await next.render('/not-found')
      expect(html).toContain('I am still a valid page')
    })
  }

  describe('with default runtime', () => {
    runTests()
  })

  describe('with runtime = edge', () => {
    let originalLayout = ''

    beforeAll(async () => {
      await next.stop()
      originalLayout = await next.readFile('app/layout.js')
      await next.patchFile(
        'app/layout.js',
        `export const runtime = 'edge'\n${originalLayout}`
      )
      await next.start()
    })
    afterAll(async () => {
      await next.patchFile('app/layout.js', originalLayout)
    })

    runTests()
  })
})
