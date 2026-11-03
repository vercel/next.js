import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app dir - not-found - conflict route', () => {
  describe.each(['default', 'edge'])('with %s runtime', (runtime) => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        ...(runtime === 'edge' && {
          'app/layout.js': new FileRef(join(__dirname, 'edge-layout.js')),
        }),
      },
    })

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
  })
})
