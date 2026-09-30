import { nextTestSetup } from 'e2e-utils'
import { waitForRedbox, getRedboxHeader, retry } from 'next-test-utils'

describe('revalidateTag-rsc', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    captureRuntimeLogs: true,
  })

  it('should revalidate fetch cache if revalidateTag invoked via server action', async () => {
    const browser = await next.browser('/')
    const randomNumber = await browser.elementById('data').text()
    await browser.refresh()
    const randomNumber2 = await browser.elementById('data').text()
    expect(randomNumber).toEqual(randomNumber2)

    await browser.elementByCss('#submit-form').click()

    await retry(async () => {
      const randomNumber3 = await browser.elementById('data').text()
      expect(randomNumber3).not.toEqual(randomNumber)
    })
  })

  it('should error if revalidateTag is called during render', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#revalidate-via-page').click()

    if (isNextDev) {
      await waitForRedbox(browser)
      await expect(getRedboxHeader(browser)).resolves.toContain(
        'Route "/revalidate_via_page": `revalidateTag("data")` can\'t be called during render.'
      )
    } else {
      await retry(async () => {
        expect(
          await browser.eval('document.documentElement.innerHTML')
        ).toContain('This page couldn\u2019t load')
      })
    }

    await retry(() => {
      expect(next.cliOutput).toContain(
        'Route "/revalidate_via_page": `revalidateTag("data")` can\'t be called during render. Call it from a Server Action or Route Handler instead.\nLearn more: https://nextjs.org/docs/messages/revalidate-in-use-cache'
      )
    }, 30_000)
  })

  it('should error if revalidateTag is called inside a cached function', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#revalidate-via-cache').click()

    if (isNextDev) {
      await waitForRedbox(browser)
      await expect(getRedboxHeader(browser)).resolves.toContain(
        'Route "/revalidate_via_cache": `revalidateTag("data")` can\'t be called inside a cached function.'
      )
    } else {
      await retry(async () => {
        expect(
          await browser.eval('document.documentElement.innerHTML')
        ).toContain('This page couldn\u2019t load')
      })
    }

    await retry(() => {
      expect(next.cliOutput).toContain(
        'Route "/revalidate_via_cache": `revalidateTag("data")` can\'t be called inside a cached function. Call it from a Server Action or Route Handler instead.\nLearn more: https://nextjs.org/docs/messages/revalidate-in-use-cache'
      )
    }, 30_000)
  })
})
