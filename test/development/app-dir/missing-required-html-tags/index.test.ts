import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
  retry,
} from 'next-test-utils'
import { outdent } from 'outdent'

describe('app-dir - missing required html tags', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should show error overlay', async () => {
    const browser = await next.browser('/')

    // There was a bug where multiple dialogs were being rendered when required
    // html tags were missing. This test ensures there is no regression.
    await retry(async () => {
      const dialogs = await browser.elementsByCss('nextjs-portal')
      expect(dialogs).toHaveLength(1)
    })

    await assertHasRedbox(browser)
    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(`
      "The following tags are missing in the Root Layout: <html>, <body>.
      Read more at https://nextjs.org/docs/messages/missing-root-layout-tags"
    `)
  })

  it('should hmr when you fix the error', async () => {
    const browser = await next.browser('/')

    await next.patchFile('app/layout.js', (code) =>
      code.replace('return children', 'return <body>{children}</body>')
    )

    await assertHasRedbox(browser)
    // Wait for the HMR to apply and the updated error to show.
    await retry(async () => {
      expect(await getRedboxDescription(browser)).toEqual(outdent`
        The following tags are missing in the Root Layout: <html>.
        Read more at https://nextjs.org/docs/messages/missing-root-layout-tags
      `)
    })

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

    if (process.env.TURBOPACK) {
      await assertHasRedbox(browser)
      // Wait for the HMR to apply and the updated error to show.
      await retry(async () => {
        expect(await getRedboxDescription(browser)).toEqual(outdent`
          The following tags are missing in the Root Layout: <html>, <body>.
          Read more at https://nextjs.org/docs/messages/missing-root-layout-tags
        `)
      })
    } else {
      // TODO(NDX-768): Should show "missing tags" error
      await assertNoRedbox(browser)
    }
  })
})
