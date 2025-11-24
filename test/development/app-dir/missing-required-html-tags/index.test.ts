import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  waitForNoRedbox,
  getToastErrorCount,
  hasErrorToast,
  retry,
} from 'next-test-utils'

describe('app-dir - missing required html tags', () => {
  const { next } = nextTestSetup({ files: __dirname })

  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    // TODO(restart-on-cache-miss): reenable once the bug is fixed in:
    // https://github.com/vercel/next.js/pull/85818
    it.skip('currently broken in Cache Components', () => {})
    return
  }

  it('should display correct error count in dev indicator', async () => {
    const browser = await next.browser('/')
    await waitForRedbox(browser)
    retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)
    })
    expect(await getToastErrorCount(browser)).toBe(1)
  })

  it('should show error overlay', async () => {
    const browser = await next.browser('/')

    await waitForRedbox(browser)
    await expect(browser).toDisplayRedbox(`
     {
       "description": "Missing <html> and <body> tags in the root layout.
     Read more at https://nextjs.org/docs/messages/missing-root-layout-tags",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": null,
       "stack": [],
     }
    `)
  })

  it('should reload when you fix the error', async () => {
    let reloaded = false

    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('requestfinished', async (request) => {
          if (new URL(request.url()).pathname === '/') {
            reloaded = true
          }
        })
      },
    })

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Missing <html> and <body> tags in the root layout.
     Read more at https://nextjs.org/docs/messages/missing-root-layout-tags",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": null,
       "stack": [],
     }
    `)

    reloaded = false

    await Promise.all([
      next.patchFile('app/layout.js', (code) =>
        code.replace('return children', 'return <body>{children}</body>')
      ),
      retry(() => expect(reloaded).toBe(true), 10_000),
    ])

    await retry(() =>
      expect(browser).toDisplayRedbox(`
     {
       "description": "Missing <html> tags in the root layout.
     Read more at https://nextjs.org/docs/messages/missing-root-layout-tags",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": null,
       "stack": [],
     }
    `)
    )

    reloaded = false

    await Promise.all([
      next.patchFile('app/layout.js', (code) =>
        code.replace(
          'return <body>{children}</body>',
          'return <html><body>{children}</body></html>'
        )
      ),
      retry(() => expect(reloaded).toBe(true), 10_000),
    ])

    await waitForNoRedbox(browser)
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    // Reintroduce the bug, but only missing html tag
    await next.patchFile('app/layout.js', (code) =>
      code.replace(
        'return <html><body>{children}</body></html>',
        'return children'
      )
    )

    // TODO(NDX-768): Should show "missing tags" error
    await waitForNoRedbox(browser)
  })
})
