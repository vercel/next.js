import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'

async function getStackFramesContent(browser) {
  const stackFrameElements = await browser.elementsByCss(
    '[data-nextjs-call-stack-frame]'
  )
  const stackFramesContent = (
    await Promise.all(
      stackFrameElements.map(async (frame) => {
        const functionNameEl = await frame.$('[data-nextjs-frame-expanded]')
        const sourceEl = await frame.$('[data-has-source]')
        const functionName = functionNameEl
          ? await functionNameEl.innerText()
          : ''
        const source = sourceEl ? await sourceEl.innerText() : ''

        if (!functionName) {
          return ''
        }
        return `at ${functionName} (${source})`
      })
    )
  )
    .filter(Boolean)
    .join('\n')

  return stackFramesContent
}

describe('app-dir - owner-stack-invalid-element-type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should catch invalid element from a client-only component', async () => {
    const browser = await next.browser('/browser')

    await assertHasRedbox(browser)
    const source = await getRedboxSource(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(stackFramesContent).toMatchInlineSnapshot(
        `"at Page (app/browser/page.js (10:10))"`
      )
      expect(source).toMatchInlineSnapshot(`
        "app/browser/browser-only.js (8:7) @ BrowserOnly

           6 |   return (
           7 |     <div>
        >  8 |       <Foo />
             |       ^
           9 |     </div>
          10 |   )
          11 | }"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(
        `"at BrowserOnly (app/browser/page.js (10:11))"`
      )
      expect(source).toMatchInlineSnapshot(`
        "app/browser/browser-only.js (8:8) @ Foo

           6 |   return (
           7 |     <div>
        >  8 |       <Foo />
             |        ^
           9 |     </div>
          10 |   )
          11 | }"
      `)
    }
  })

  it('should catch invalid element from a rsc component', async () => {
    const browser = await next.browser('/rsc')

    await assertHasRedbox(browser)
    const stackFramesContent = await getStackFramesContent(browser)
    const source = await getRedboxSource(browser)

    if (process.env.TURBOPACK) {
      expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      expect(source).toMatchInlineSnapshot(`
        "app/rsc/page.js (6:7) @ Page

          4 |   return (
          5 |     <div>
        > 6 |       <Foo />
            |       ^
          7 |     </div>
          8 |   )
          9 | }"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      expect(source).toMatchInlineSnapshot(`
        "app/rsc/page.js (6:8) @ Foo

          4 |   return (
          5 |     <div>
        > 6 |       <Foo />
            |        ^
          7 |     </div>
          8 |   )
          9 | }"
      `)
    }
  })

  it('should catch invalid element from on ssr client component', async () => {
    const browser = await next.browser('/ssr')

    await assertHasRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    const source = await getRedboxSource(browser)
    if (process.env.TURBOPACK) {
      expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      expect(source).toMatchInlineSnapshot(`
        "app/ssr/page.js (8:7) @ Page

           6 |   return (
           7 |     <div>
        >  8 |       <Foo />
             |       ^
           9 |     </div>
          10 |   )
          11 | }"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      expect(source).toMatchInlineSnapshot(`
        "app/ssr/page.js (8:8) @ Foo

           6 |   return (
           7 |     <div>
        >  8 |       <Foo />
             |        ^
           9 |     </div>
          10 |   )
          11 | }"
      `)
    }
  })
})
