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
      // TODO(veil): Should be a single error
      // TODO(veil): https://linear.app/vercel/issue/NDX-554/hide-the-anonymous-frames-which-are-between-2-ignored-frames
      await expect(browser).toDisplayRedbox(`
       {
         "count": 2,
         "description": "Error: Failed prop type: The prop \`href\` expects a \`string\` or \`object\` in \`<Link>\`, but got \`undefined\` instead.
       Open your browser's console to view the Component stack trace.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "app/invalid-href/page.js (6:10) @ Hello
       > 6 |   return <Link>Hello, Dave!</Link>
           |          ^",
         "stack": [
           "Array.forEach <anonymous> (0:0)",
           "Hello app/invalid-href/page.js (6:10)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('body').text()).toMatchInlineSnapshot(
      `"Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)."`
    )
  })

  it('no children', async () => {
    const browser = await webdriver(next.appPort, '/no-children')

    if (isNextDev) {
      // TODO(veil): Should be a single error
      // TODO(veil): https://linear.app/vercel/issue/NDX-554/hide-the-anonymous-frames-which-are-between-2-ignored-frames
      await expect(browser).toDisplayRedbox(`
       {
         "count": 2,
         "description": "Error: No children were passed to <Link> with \`href\` of \`/about\` but one child is required https://nextjs.org/docs/messages/link-no-children",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "app/no-children/page.js (7:10) @ Page
       > 7 |   return <Link href="/about" legacyBehavior></Link>
           |          ^",
         "stack": [
           "Page app/no-children/page.js (7:10)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('body').text()).toMatchInlineSnapshot(
      `"Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)."`
    )
  })

  it('multiple children', async () => {
    const browser = await webdriver(next.appPort, '/multiple-children')

    if (isNextDev) {
      // TODO(veil): Should be a single error
      // TODO(veil): https://linear.app/vercel/issue/NDX-554/hide-the-anonymous-frames-which-are-between-2-ignored-frames
      await expect(browser).toDisplayRedbox(`
       {
         "count": 2,
         "description": "Error: Multiple children were passed to <Link> with \`href\` of \`/\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children 
       Open your browser's console to view the Component stack trace.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "app/multiple-children/page.js (7:5) @ Index
       >  7 |     <Link href="/" legacyBehavior>
            |     ^",
         "stack": [
           "Index app/multiple-children/page.js (7:5)",
         ],
       }
      `)
    }
    expect(await browser.elementByCss('body').text()).toMatchInlineSnapshot(
      `"Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)."`
    )
  })
})
