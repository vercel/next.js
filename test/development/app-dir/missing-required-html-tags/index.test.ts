import { nextTestSetup } from 'e2e-utils'
import { getRedboxDescription, hasRedbox, retry } from 'next-test-utils'

describe('app-dir - missing required html tags', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should show error overlay', async () => {
    const browser = await next.browser('/')

    expect(await hasRedbox(browser)).toBe(true)
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

    expect(await hasRedbox(browser)).toBe(true)
    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(`
      "The following tags are missing in the Root Layout: <html>.
      Read more at https://nextjs.org/docs/messages/missing-root-layout-tags"
    `)

    await next.patchFile('app/layout.js', (code) =>
      code.replace(
        'return <body>{children}</body>',
        'return <html><body>{children}</body></html>'
      )
    )

    expect(await hasRedbox(browser)).toBe(false)
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    // Reintroduce the bug, but only missing html tag
    await next.patchFile('app/layout.js', (code) =>
      code.replace(
        'return <html><body>{children}</body></html>',
        'return children'
      )
    )

    await retry(async () => {
      expect(await hasRedbox(browser)).toBe(true)
    })

    // Fix the issue again
    await next.patchFile('app/layout.js', (code) =>
      code.replace(
        'return children',
        'return <html><body>{children}</body></html>'
      )
    )

    await retry(async () => {
      expect(await hasRedbox(browser)).toBe(false)
    })
  })
})
