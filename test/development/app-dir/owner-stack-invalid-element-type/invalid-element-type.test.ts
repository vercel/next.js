process.env.TEST_OWNER_STACK = 'false'

import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxSource,
  getStackFramesContent,
} from 'next-test-utils'

// TODO: When owner stack is enabled by default, remove the condition and only keep one test
const isOwnerStackEnabled =
  process.env.TEST_OWNER_STACK !== 'false' ||
  process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

;(isOwnerStackEnabled ? describe.skip : describe)(
  'app-dir - invalid-element-type',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should catch invalid element from a browser only component', async () => {
      const browser = await next.browser('/browser')

      await assertHasRedbox(browser)
      const source = await getRedboxSource(browser)

      const stackFramesContent = await getStackFramesContent(browser)
      if (process.env.TURBOPACK) {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
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
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        // FIXME: the methodName should be `@ BrowserOnly` instead of `@ Foo`
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
          "app/rsc/page.js (5:11) @ Inner

            3 | // Intermediate component for testing owner stack
            4 | function Inner() {
          > 5 |   return <Foo />
              |           ^
            6 | }
            7 |
            8 | export default function Page() {"
        `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        // FIXME: the methodName should be `@ Inner` instead of `@ Foo`
        expect(source).toMatchInlineSnapshot(`
          "app/rsc/page.js (5:11) @ Foo

            3 | // Intermediate component for testing owner stack
            4 | function Inner() {
          > 5 |   return <Foo />
              |           ^
            6 | }
            7 |
            8 | export default function Page() {"
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
          "app/ssr/page.js (7:10) @ Inner

             5 | // Intermediate component for testing owner stack
             6 | function Inner() {
          >  7 |   return <Foo />
               |          ^
             8 | }
             9 |
            10 | export default function Page() {"
        `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        // FIXME: the methodName should be `@ Inner` instead of `@ Foo`
        expect(source).toMatchInlineSnapshot(`
          "app/ssr/page.js (7:11) @ Foo

             5 | // Intermediate component for testing owner stack
             6 | function Inner() {
          >  7 |   return <Foo />
               |           ^
             8 | }
             9 |
            10 | export default function Page() {"
        `)
      }
    })
  }
)
