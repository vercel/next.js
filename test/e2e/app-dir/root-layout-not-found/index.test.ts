import { createNextDescribe } from 'e2e-utils'
import { check, getRedboxDescription, hasRedbox } from 'next-test-utils'

createNextDescribe(
  'app dir - root layout not found',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    it('should error on client notFound from root layout in browser', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('#trigger-not-found').click()

      if (isNextDev) {
        await check(async () => {
          expect(await hasRedbox(browser, true)).toBe(true)
          expect(await getRedboxDescription(browser)).toMatch(
            /notFound\(\) is not allowed to use in root layout/
          )
          return 'success'
        }, /success/)
      } else {
        expect(await browser.elementByCss('h2').text()).toBe(
          'Application error: a server-side exception has occurred (see the server logs for more information).'
        )
        expect(await browser.elementByCss('p').text()).toBe(
          'Digest: NEXT_NOT_FOUND'
        )
      }
    })

    it('should error on server notFound from root layout on server-side', async () => {
      const browser = await next.browser('/?root-not-found=1')

      if (isNextDev) {
        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxDescription(browser)).toBe(
          'Error: notFound() is not allowed to use in root layout'
        )
      } else {
        expect(await browser.elementByCss('h2').text()).toBe(
          'Application error: a server-side exception has occurred (see the server logs for more information).'
        )
        expect(await browser.elementByCss('p').text()).toBe(
          'Digest: NEXT_NOT_FOUND'
        )
      }
    })
  }
)
