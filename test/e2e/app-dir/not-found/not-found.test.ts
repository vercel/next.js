import { createNextDescribe } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir - not-found',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    describe('root not-found page', () => {
      it('should use the not-found page for non-matching routes', async () => {
        const html = await next.render('/random-content')
        expect(html).toContain('This Is The Not Found Page')
      })
    })
  }
)
