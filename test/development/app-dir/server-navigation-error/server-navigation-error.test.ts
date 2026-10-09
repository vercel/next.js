import { nextTestSetup } from 'e2e-utils'

describe('server-navigation-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('pages router', () => {
    it('should error on navigation API redirect', async () => {
      const browser = await next.browser('/pages/redirect')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Next.js navigation API is not allowed to be used in Pages Router.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "pages/pages/redirect.tsx (4:11) @ Page
       > 4 |   redirect('/')
           |           ^",
         "stack": [
           "Page pages/pages/redirect.tsx (4:11)",
         ],
       }
      `)
    })

    it('should error on navigation API notFound', async () => {
      const browser = await next.browser('/pages/not-found')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Next.js navigation API is not allowed to be used in Pages Router.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "pages/pages/not-found.tsx (4:11) @ Page
       > 4 |   notFound()
           |           ^",
         "stack": [
           "Page pages/pages/not-found.tsx (4:11)",
         ],
       }
      `)
    })
  })

  describe('middleware', () => {
    it('should error on navigation API redirect ', async () => {
      const browser = await next.browser('/middleware/redirect')
      // FIXME: the first request to middleware error load didn't show the redbox, need one more reload
      await browser.refresh()

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Next.js navigation API is not allowed to be used in Middleware.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "middleware.ts (8:13) @ middleware
       >  8 |     redirect('/')
            |             ^",
         "stack": [
           "middleware middleware.ts (8:13)",
         ],
       }
      `)
    })

    it('should error on navigation API not-found', async () => {
      const browser = await next.browser('/middleware/not-found')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Next.js navigation API is not allowed to be used in Middleware.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "middleware.ts (6:13) @ middleware
       > 6 |     notFound()
           |             ^",
         "stack": [
           "middleware middleware.ts (6:13)",
         ],
       }
      `)
    })
  })
})
