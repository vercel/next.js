import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'

// TODO: When owner stack is enabled by default, remove the condition and only keep one test
const isOwnerStackEnabled =
  process.env.TEST_OWNER_STACK !== 'false' ||
  process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

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

  let nextConfig: string = ''
  beforeAll(async () => {
    if (!isOwnerStackEnabled) {
      await next.stop()
      await next.patchFile('next.config.js', (content: string) => {
        nextConfig = content
        return content.replace(
          `reactOwnerStack: true`,
          `reactOwnerStack: false`
        )
      })
      await next.start()
    }
  })
  afterAll(async () => {
    if (!isOwnerStackEnabled) {
      await next.stop()
      // Restore original next.config.js
      await next.patchFile('next.config.js', nextConfig)
    }
  })

  it('should catch invalid element from a browser only component', async () => {
    const browser = await next.browser('/browser')

    await assertHasRedbox(browser)
    const source = await getRedboxSource(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      if (isOwnerStackEnabled) {
        // FIXME: the methodName of the stack frame is not aligned between Turbopack and Webpack
        expect(stackFramesContent).toMatchInlineSnapshot(`
          "at Inner (app/browser/page.js (12:5))
          at Page (app/browser/page.js (17:10))"
        `)
      } else {
        // The stack frame of the triggered line is missing
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      }
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
      if (isOwnerStackEnabled) {
        // FIXME: the methodName of the stack frame is not aligned between Turbopack and Webpack
        expect(stackFramesContent).toMatchInlineSnapshot(`
          "at BrowserOnly (app/browser/page.js (12:6))
          at Inner (app/browser/page.js (17:11))"
        `)
      } else {
        // The stack frame of the triggered line is missing
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      }
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
        "app/rsc/page.js (6:5) @ Inner

          4 | function Inner() {
          5 |   return (
        > 6 |     <Foo />
            |     ^
          7 |   )
          8 | }
          9 |"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      expect(source).toMatchInlineSnapshot(`
        "app/rsc/page.js (6:6) @ Foo

          4 | function Inner() {
          5 |   return (
        > 6 |     <Foo />
            |      ^
          7 |   )
          8 | }
          9 |"
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
        "app/ssr/page.js (8:5) @ Inner

           6 | function Inner() {
           7 |   return (
        >  8 |     <Foo />
             |     ^
           9 |   )
          10 | }
          11 |"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`""`)
      expect(source).toMatchInlineSnapshot(`
        "app/ssr/page.js (8:6) @ Foo

           6 | function Inner() {
           7 |   return (
        >  8 |     <Foo />
             |      ^
           9 |   )
          10 | }
          11 |"
      `)
    }
  })
})
