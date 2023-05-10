import { createNextDescribe } from 'e2e-utils'

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
