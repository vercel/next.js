import { nextTestSetup } from 'e2e-utils'
import webdriver from 'next-webdriver'

describe('next-link', () => {
  const { skipped, next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('errors on invalid href', async () => {
    const browser = await webdriver(next.appPort, '/invalid-href')

    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Failed prop type: The prop \`href\` expects a \`string\` or \`object\` in \`<Link>\`, but got \`undefined\` instead.
       Open your browser's console to view the Component stack trace.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/invalid-href/page.js (6:10) @ Hello
       > 6 |   return <Link>Hello, Dave!</Link>
           |          ^",
         "stack": [
           "Hello app/invalid-href/page.js (6:10)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('body').text()).toMatchInlineSnapshot(
      `"Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)."`
    )
  })

  it('invalid `prefetch` causes runtime error (dev-only)', async () => {
    const browser = await webdriver(next.appPort, '/invalid-prefetch')

    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Failed prop type: The prop \`prefetch\` expects a \`boolean | "auto" | "unstable_forceStale"\` in \`<Link>\`, but got \`string\` instead.
       Open your browser's console to view the Component stack trace.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/invalid-prefetch/page.js (7:5) @ Hello
       >  7 |     <Link prefetch="unknown" href="https://nextjs.org/">
            |     ^",
         "stack": [
           "Hello app/invalid-prefetch/page.js (7:5)",
         ],
       }
      `)
      expect(await browser.elementByCss('body').text()).toMatchInlineSnapshot(
        `"Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)."`
      )
    } else {
      expect(await browser.elementByCss('body').text()).toMatchInlineSnapshot(
        `"Link with unknown \`prefetch\` renders in prod."`
      )
    }
  })
})
