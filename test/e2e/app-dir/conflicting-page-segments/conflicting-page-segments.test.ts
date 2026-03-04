import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry, waitForNoRedbox } from 'next-test-utils'

describe('conflicting-page-segments', () => {
  describe('basic', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('should throw an error when a route groups causes a conflict with a parallel segment', async () => {
      if (isNextDev) {
        await next.start()
        const html = await next.render('/')

        expect(html).toContain(
          'You cannot have two parallel pages that resolve to the same path.'
        )
      } else {
        await expect(next.start()).rejects.toThrow('next build failed')

        await retry(() => {
          expect(next.cliOutput).toMatch(
            /You cannot have two parallel pages that resolve to the same path\. Please check \/\(group-a\)(\/page)? and \/\(group-b\)(\/page)?\./i
          )
        })
      }
    })
  })
  ;(isNextDev ? describe : describe.skip)('dev mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should recover from the error when the conflicting segments are removed', async () => {
      const browser = await next.browser('/')
      if (process.env.IS_TURBOPACK_TEST) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "You cannot have two parallel pages that resolve to the same path. Please check /(group-a) and /(group-b).",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/(group-b)
         You cannot have two parallel pages that resolve to the same path. Please check /(group-a) and /(group-b).",
           "stack": [],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "You cannot have two parallel pages that resolve to the same path. Please check /(group-a)/page and /(group-b)/page. Refer to the route group docs for more information: https://nextjs.org/docs/app/building-your-application/routing/route-groups",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "app/(group-a)/page.tsx
         You cannot have two parallel pages that resolve to the same path. Please check /(group-a)/page and /(group-b)/page. Refer to the route group docs for more information: https://nextjs.org/docs/app/building-your-application/routing/route-groups",
           "stack": [],
         }
        `)
      }

      await next.deleteFile('app/(group-b)/page.tsx')

      await retry(async () => {
        await waitForNoRedbox(browser)
      })

      expect(await browser.elementByCss('main').text()).toStartWith('Home To')
    })
  })
})
