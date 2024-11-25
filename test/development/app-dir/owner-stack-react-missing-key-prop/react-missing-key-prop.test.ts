import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource, openRedbox } from 'next-test-utils'

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

;(isOwnerStackEnabled ? describe.skip : describe)(
  'app-dir - react-missing-key-prop',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    let nextConfig: string = ''
    beforeAll(async () => {
      await next.stop()
      await next.patchFile('next.config.js', (content: string) => {
        nextConfig = content
        return content.replace(
          `reactOwnerStack: true`,
          `reactOwnerStack: false`
        )
      })
      await next.start()
    })
    afterAll(async () => {
      await next.stop()
      // Restore original next.config.js
      await next.patchFile('next.config.js', nextConfig)
    })

    it('should catch invalid element from on rsc component', async () => {
      const browser = await next.browser('/rsc')
      await openRedbox(browser)

      const stackFramesContent = await getStackFramesContent(browser)
      const source = await getRedboxSource(browser)

      if (process.env.TURBOPACK) {
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
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        // FIXME: the methodName should be `@ Page` instead of `@ div`
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
    })

    it('should catch invalid element from on ssr client component', async () => {
      const browser = await next.browser('/ssr')
      await openRedbox(browser)

      const stackFramesContent = await getStackFramesContent(browser)
      const source = await getRedboxSource(browser)
      if (process.env.TURBOPACK) {
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
      } else {
        expect(stackFramesContent).toMatchInlineSnapshot(`""`)
        // FIXME: the methodName should be `@ Page` instead of `@ div`
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
    })
  }
)
