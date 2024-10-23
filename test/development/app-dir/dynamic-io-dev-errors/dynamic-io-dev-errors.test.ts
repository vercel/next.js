import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  hasErrorToast,
  retry,
  waitForAndOpenRuntimeError,
} from 'next-test-utils'

describe('Dynamic IO Dev Errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show a red box error on the SSR render', async () => {
    const browser = await next.browser('/error')

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)

      await waitForAndOpenRuntimeError(browser)

      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"[ Server ]  Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
      )
    })
  })

  it('should show a red box error on client navigations', async () => {
    const browser = await next.browser('/no-error')

    expect(await hasErrorToast(browser)).toBe(false)

    await browser.elementByCss("[href='/error']").click()

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)

      await waitForAndOpenRuntimeError(browser)

      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"[ Server ]  Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
      )
    })
  })
})
