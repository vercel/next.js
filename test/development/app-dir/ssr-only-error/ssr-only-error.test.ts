import { nextTestSetup } from 'e2e-utils'
import {
  assertNoRedbox,
  getRedboxDescription,
  getRedboxSource,
  hasErrorToast,
  openRedbox,
} from 'next-test-utils'

describe('ssr-only-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show ssr only error in error overlay', async () => {
    const browser = await next.browser('/')

    // Ensure it's not like server error that is shown by default
    await hasErrorToast(browser)

    await openRedbox(browser)

    const description = await getRedboxDescription(browser)
    const source = await getRedboxSource(browser)

    expect({
      description,
      source,
    }).toMatchInlineSnapshot(`
     {
       "description": "Error: SSR only error",
       "source": "app/page.tsx (5:11) @ Page

       3 | export default function Page() {
       4 |   if (typeof window === 'undefined') {
     > 5 |     throw new Error('SSR only error')
         |           ^
       6 |   }
       7 |   return <p>hello world</p>
       8 | }",
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
