import { nextTestSetup } from 'e2e-utils'

describe('app-dir - owner-stack-invalid-element-type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should catch invalid element from a browser only component', async () => {
    const browser = await next.browser('/browser')

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.

     Check the render method of \`BrowserOnly\`.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/browser/browser-only.js (8:7) @ BrowserOnly
     >  8 |       <Foo />
          |       ^",
       "stack": [
         "BrowserOnly app/browser/browser-only.js (8:7)",
         "Inner app/browser/page.js (11:10)",
         "Page app/browser/page.js (15:10)",
       ],
     }
    `)
  })

  it('should catch invalid element from a rsc component', async () => {
    const browser = await next.browser('/rsc')

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.

     Check the render method of \`Inner\`.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/rsc/page.js (5:10) @ Inner
     > 5 |   return <Foo />
         |          ^",
       "stack": [
         "Inner app/rsc/page.js (5:10)",
         "Page app/rsc/page.js (11:7)",
       ],
     }
    `)
  })

  it('should catch invalid element from on ssr client component', async () => {
    const browser = await next.browser('/ssr')

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.

     Check the render method of \`Inner\`.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/ssr/page.js (7:10) @ Inner
     >  7 |   return <Foo />
          |          ^",
       "stack": [
         "Inner app/ssr/page.js (7:10)",
         "Page app/ssr/page.js (13:7)",
       ],
     }
    `)
  })
})
