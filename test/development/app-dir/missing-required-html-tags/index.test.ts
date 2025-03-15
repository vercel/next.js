import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getToastErrorCount,
  hasErrorToast,
  retry,
} from 'next-test-utils'

describe('app-dir - missing required html tags', () => {
  const { next, isTurbopack } = nextTestSetup({ files: __dirname })

  it('should display correct error count in dev indicator', async () => {
    const browser = await next.browser('/')

    retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)
    })
    expect(await getToastErrorCount(browser)).toBe(1)
  })

  it('should show error overlay', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)
    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: Missing <html> and <body> tags in the root layout.
     Read more at https://nextjs.org/docs/messages/missing-root-layout-tags",
       "environmentLabel": null,
       "label": "Unhandled Runtime Error",
       "source": null,
       "stack": [],
     }
    `)
  })

  it('should hmr when you fix the error', async () => {
    const browser = await next.browser('/')

    await next.patchFile('app/layout.js', (code) =>
      code.replace('return children', 'return <body>{children}</body>')
    )

    await assertHasRedbox(browser)

    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: Missing <html> tags in the root layout.
     Read more at https://nextjs.org/docs/messages/missing-root-layout-tags",
       "environmentLabel": null,
       "label": "Unhandled Runtime Error",
       "source": null,
       "stack": [],
     }
    `)

    await next.patchFile('app/layout.js', (code) =>
      code.replace(
        'return <body>{children}</body>',
        'return <html><body>{children}</body></html>'
      )
    )

    await assertNoRedbox(browser)
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    // Reintroduce the bug, but only missing html tag
    await next.patchFile('app/layout.js', (code) =>
      code.replace(
        'return <html><body>{children}</body></html>',
        'return children'
      )
    )

    if (isTurbopack) {
      await assertHasRedbox(browser)
      await expect(browser).toDisplayRedbox(`
       {
         "count": 2,
         "description": "Error: Missing <html> and <body> tags in the root layout.
       Read more at https://nextjs.org/docs/messages/missing-root-layout-tags",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      // TODO(NDX-768): Should show "missing tags" error
      await assertNoRedbox(browser)
    }
  })
})
