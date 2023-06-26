import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir - not-found',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    describe('root not-found page', () => {
      it('should use the not-found page for non-matching routes', async () => {
        const html = await next.render('/random-content')
        expect(html).toContain('This Is The Not Found Page')
      })

      it('should allow to have a valid /not-found route', async () => {
        const html = await next.render('/not-found')
        expect(html).toContain("I'm still a valid page")
      })

      if (isNextDev) {
        it('should not reload the page', async () => {
          const browser = await next.browser('/random-content')
          const timestamp = await browser.elementByCss('#timestamp').text()

          await new Promise((resolve) => {
            setTimeout(resolve, 3000)
          })

          await check(async () => {
            const newTimestamp = await browser.elementByCss('#timestamp').text()
            return newTimestamp !== timestamp ? 'failure' : 'success'
          }, 'success')
        })

        it('should render the 404 page when the file is removed, and restore the page when re-added', async () => {
          const browser = await next.browser('/')
          await check(() => browser.elementByCss('h1').text(), 'My page')
          await next.renameFile('./app/page.js', './app/foo.js')
          await check(
            () => browser.elementByCss('h1').text(),
            'This Is The Not Found Page'
          )
          await next.renameFile('./app/foo.js', './app/page.js')
          await check(() => browser.elementByCss('h1').text(), 'My page')
        })
      }

      if (!isNextDev) {
        it('should create the 404 mapping and copy the file to pages', async () => {
          const html = await next.readFile('.next/server/pages/404.html')
          expect(html).toContain('This Is The Not Found Page')
          expect(
            await next.readFile('.next/server/pages-manifest.json')
          ).toContain('"pages/404.html"')
        })
      }
    })
  }
)
