import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, hasErrorToast } from 'next-test-utils'

describe('ssr-only-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show ssr only error in error overlay', async () => {
    const browser = await next.browser('/')

    // TODO(veil): Missing Owner Stack (NDX-905)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "SSR only error",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/page.tsx (5:11) @ Component
     > 5 |     throw new Error('SSR only error')
         |           ^",
       "stack": [
         "Component app/page.tsx (5:11)",
       ],
     }
    `)
  })

  it('should not handle internal nextjs errors that will be handled by error boundaries', async () => {
    const browser = await next.browser('/notfound', {
      pushErrorAsConsoleLog: true,
    })

    await assertNoRedbox(browser)
    expect(await hasErrorToast(browser)).toBe(false)

    const text = await browser.elementByCss('body').text()
    expect(text).toBe('404\nThis page could not be found.')

    // Assert there's only one console.error from browser itself
    const errorLogs = (await browser.log()).filter(
      (log) => log.source === 'error'
    )

    expect(errorLogs).toEqual([
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(
          'the server responded with a status of 404'
        ),
      }),
    ])
  })
})
