import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxCallStack,
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
        `"[ Server ] Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
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
        `"[ Server ] Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
      )
    })
  })

  it('should display error when component accessed data without suspense boundary', async () => {
    const browser = await next.browser('/no-accessed-data')

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)
      await waitForAndOpenRuntimeError(browser)
      await assertHasRedbox(browser)
    })

    const description = await getRedboxDescription(browser)
    const stack = await getRedboxCallStack(browser)
    const result = {
      description,
      stack,
    }

    expect(result).toMatchInlineSnapshot(`
      {
        "description": "[ Server ] In Route "/no-accessed-data" this component accessed data without a Suspense boundary above it to provide a fallback UI. See more info: https://nextjs.org/docs/messages/next-prerender-data",
        "stack": "Page [Server]
      <anonymous> (2:1)
      Root [Server]
      <anonymous> (2:1)",
      }
    `)
  })
})
