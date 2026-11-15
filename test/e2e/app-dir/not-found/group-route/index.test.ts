import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app dir - not-found - group route', () => {
  describe.each(['default', 'edge'])('with %s runtime', (runtime) => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        ...(runtime === 'edge' && {
          'app/layout.js': new FileRef(join(__dirname, 'edge-layout.js')),
        }),
      },
    })

    it('should use the not-found page under group routes', async () => {
      const browser = await next.browser('/blog')
      expect(await browser.elementByCss('h1').text()).toContain('Group Layout')
      expect(await browser.elementByCss('#not-found').text()).toContain(
        'Not found!'
      )
    })
  })
})
