import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxSource,
  openRedbox,
  hasRedboxCallStack,
} from 'next-test-utils'

// TODO: When owner stack is enabled by default, remove the condition and only keep one test
const isOwnerStackEnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

async function getStackFramesContent(browser) {
  await hasRedboxCallStack(browser)
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

// Without owner stack, the source is not available
;(isOwnerStackEnabled ? describe.skip : describe)(
  'app-dir - react-missing-key-prop',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'next.config.js': `
        /**
         * @type {import('next').NextConfig}
         */
        const nextConfig = {
          experimental: {
            reactOwnerStack: false,
          },
        }

        module.exports = nextConfig
        `,
      },
    })

    it('should catch invalid element from on rsc component', async () => {
      const browser = await next.browser('/rsc')
      await openRedbox(browser)

      const stackFramesContent = await getStackFramesContent(browser)
      const source = await getRedboxSource(browser)

      if (process.env.TURBOPACK) {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at Page (app/rsc/page.tsx (5:6))"`
        )
        expect(source).toMatchInlineSnapshot(`
         "app/rsc/page.tsx (5:6) @ Page

           3 | export default function Page() {
           4 |   return (
         > 5 |     <div>
             |      ^
           6 |       {list.map((item, index) => (
           7 |         <span>{item}</span>
           8 |       ))}"
        `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at Page (app/rsc/page.tsx (5:6))"`
        )
        expect(source).toMatchInlineSnapshot(`
                 "app/rsc/page.tsx (5:6) @ Page

                   3 | export default function Page() {
                   4 |   return (
                 > 5 |     <div>
                     |      ^
                   6 |       {list.map((item, index) => (
                   7 |         <span>{item}</span>
                   8 |       ))}"
              `)
      }
    })

    it('should catch invalid element from on ssr client component', async () => {
      const browser = await next.browser('/ssr')
      await openRedbox(browser)

      const stackFramesContent = await getStackFramesContent(browser)
      const source = await getRedboxSource(browser)
      if (process.env.TURBOPACK) {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at Page (app/ssr/page.tsx (7:5))"`
        )
        expect(source).toMatchInlineSnapshot(`
                 "app/ssr/page.tsx (7:5) @ Page

                    5 | export default function Page() {
                    6 |   return (
                 >  7 |     <div>
                      |     ^
                    8 |       {list.map((item, index) => (
                    9 |         <p>{item}</p>
                   10 |       ))}"
              `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at Page (app/ssr/page.tsx (7:6))"`
        )
        expect(source).toMatchInlineSnapshot(`
                 "app/ssr/page.tsx (7:6) @ Page

                    5 | export default function Page() {
                    6 |   return (
                 >  7 |     <div>
                      |      ^
                    8 |       {list.map((item, index) => (
                    9 |         <p>{item}</p>
                   10 |       ))}"
              `)
      }
    })
  }
)
