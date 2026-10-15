import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('not-found-streamed-hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not report a recoverable error for notFound() streamed into a Suspense boundary', async () => {
    const pageErrors: Error[] = []
    const browser = await next.browser('/missing', {
      beforePageLoad(page) {
        page.on('pageerror', (error: Error) => {
          pageErrors.push(error)
        })
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('.next-error-h1').text()).toBe('404')
    })

    expect(pageErrors).toEqual([])
  })
})
