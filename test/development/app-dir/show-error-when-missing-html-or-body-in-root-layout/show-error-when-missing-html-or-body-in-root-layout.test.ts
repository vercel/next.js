import { nextTestSetup } from 'e2e-utils'
import { getRedboxDescription, hasRedbox } from 'next-test-utils'

describe('show error when missing html or body in root layout', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should show error overlay', async () => {
    const browser = await next.browser('/')

    expect(await hasRedbox(browser)).toBe(true)
    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(`
      "Error: The following tags are missing in the Root Layout: html, body.
      Read more at https://nextjs.org/docs/messages/missing-root-layout-tags"
    `)
    await next.patchFile('app/layout.tsx', (code) =>
      code.replace('return children', 'return <body>{children}</body>')
    )

    expect(await hasRedbox(browser)).toBe(true)
    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(`
      "Error: The following tags are missing in the Root Layout: html.
      Read more at https://nextjs.org/docs/messages/missing-root-layout-tags"
    `)
    await next.patchFile('app/layout.tsx', (code) =>
      code.replace(
        'return <body>{children}</body>',
        'return <html><body>{children}</body></html>'
      )
    )
    expect(await hasRedbox(browser)).toBe(false)
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
