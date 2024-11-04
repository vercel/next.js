import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource, waitForAndOpenRuntimeError } from 'next-test-utils'

const isOwnerStackEnabled = process.env.TEST_OWNER_STACK !== 'false'

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

describe('owner-stack-react-missing-key-prop', () => {
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

  it('should catch invalid element from on rsc component', async () => {
    const browser = await next.browser('/rsc')
    await waitForAndOpenRuntimeError(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    const source = await getRedboxSource(browser)

    if (process.env.TURBOPACK) {
      if (isOwnerStackEnabled) {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at Page (app/rsc/page.tsx (6:13))"`
        )
        expect(source).toMatchInlineSnapshot(`
          "app/rsc/page.tsx (7:9) @ <anonymous>

             5 |     <div>
             6 |       {list.map((item, index) => (
          >  7 |         <span>{item}</span>
               |         ^
             8 |       ))}
             9 |     </div>
            10 |   )"
        `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        expect(source).toMatchInlineSnapshot(`
          "app/rsc/page.tsx (5:5) @ Page

            3 | export default function Page() {
            4 |   return (
          > 5 |     <div>
              |     ^
            6 |       {list.map((item, index) => (
            7 |         <span>{item}</span>
            8 |       ))}"
        `)
      }
    } else {
      if (isOwnerStackEnabled) {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at map (app/rsc/page.tsx (6:13))"`
        )
        expect(source).toMatchInlineSnapshot(`
          "app/rsc/page.tsx (7:10) @ span

             5 |     <div>
             6 |       {list.map((item, index) => (
          >  7 |         <span>{item}</span>
               |          ^
             8 |       ))}
             9 |     </div>
            10 |   )"
        `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        expect(source).toMatchInlineSnapshot(`
          "app/rsc/page.tsx (5:6) @ div

            3 | export default function Page() {
            4 |   return (
          > 5 |     <div>
              |      ^
            6 |       {list.map((item, index) => (
            7 |         <span>{item}</span>
            8 |       ))}"
        `)
      }
    }
  })

  it('should catch invalid element from on ssr client component', async () => {
    const browser = await next.browser('/ssr')
    await waitForAndOpenRuntimeError(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    const source = await getRedboxSource(browser)
    if (process.env.TURBOPACK) {
      if (isOwnerStackEnabled) {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at Page (app/ssr/page.tsx (8:13))"`
        )
        expect(source).toMatchInlineSnapshot(`
          "app/ssr/page.tsx (9:9) @ <unknown>

             7 |     <div>
             8 |       {list.map((item, index) => (
          >  9 |         <p>{item}</p>
               |         ^
            10 |       ))}
            11 |     </div>
            12 |   )"
        `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
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
      }
    } else {
      if (isOwnerStackEnabled) {
        expect(stackFramesContent).toMatchInlineSnapshot(
          `"at map (app/ssr/page.tsx (8:13))"`
        )
        expect(source).toMatchInlineSnapshot(`
          "app/ssr/page.tsx (9:10) @ p

             7 |     <div>
             8 |       {list.map((item, index) => (
          >  9 |         <p>{item}</p>
               |          ^
            10 |       ))}
            11 |     </div>
            12 |   )"
        `)
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        expect(source).toMatchInlineSnapshot(`
          "app/ssr/page.tsx (7:6) @ div

             5 | export default function Page() {
             6 |   return (
          >  7 |     <div>
               |      ^
             8 |       {list.map((item, index) => (
             9 |         <p>{item}</p>
            10 |       ))}"
        `)
      }
    }
  })
})
