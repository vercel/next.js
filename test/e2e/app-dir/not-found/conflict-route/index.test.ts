import { nextTestSetup } from 'e2e-utils'

describe('app dir - not-found - conflict route', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

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
