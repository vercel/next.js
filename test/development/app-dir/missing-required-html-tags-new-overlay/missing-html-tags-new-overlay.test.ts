import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
  getToastErrorCount,
  hasErrorToast,
  retry,
} from 'next-test-utils'
import { outdent } from 'outdent'

// TODO: merge with test/development/app-dir/missing-required-html-tags/index.test.ts
//  once new overlay is stable
describe('app-dir - missing required html tags', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should display correct error count in dev indicator', async () => {
    const browser = await next.browser('/')

    retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)
    })
    // Dev indicator should show 1 error
    expect(await getToastErrorCount(browser)).toBe(1)

    await assertHasRedbox(browser)

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
  })
})
