import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxCallStack,
  getRedboxDescription,
  getRedboxTitle,
  getRedboxSource,
  getRedboxTotalErrorCount,
  openRedbox,
  hasRedboxCallStack,
  assertNoRedbox,
  assertNoConsoleErrors,
} from 'next-test-utils'

async function getRedboxResult(browser: any) {
  const title = await getRedboxTitle(browser)
  const description = await getRedboxDescription(browser)
  const callStacks = (await hasRedboxCallStack(browser))
    ? await getRedboxCallStack(browser)
    : ''
  const count = await getRedboxTotalErrorCount(browser)
  const source = await getRedboxSource(browser)
  const result = {
    title,
    count,
    source,
    description,
    callStacks,
  }
  return result
}
describe('app-dir - capture-console-error-owner-stack', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should capture browser console error and format the error message', async () => {
    const browser = await next.browser('/browser/event')
    await browser.elementByCss('button').click()

    await openRedbox(browser)

    const result = await getRedboxResult(browser)

    // TODO(veil): Inconsistent cursor position for the "Page" frame
    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
       {
         "callStacks": "onClick
       app/browser/event/page.js (7:17)
       button
       <anonymous> (0:0)
       Page
       app/browser/event/page.js (5:5)",
         "count": 1,
         "description": "trigger an console <error>",
         "source": "app/browser/event/page.js (7:17) @ onClick

          5 |     <button
          6 |       onClick={() => {
       >  7 |         console.error('trigger an console <%s>', 'error')
            |                 ^
          8 |       }}
          9 |     >
         10 |       click to error",
         "title": "Console Error",
       }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
       {
         "callStacks": "onClick
       app/browser/event/page.js (7:17)
       button
       <anonymous> (0:0)
       Page
       app/browser/event/page.js (5:6)",
         "count": 1,
         "description": "trigger an console <error>",
         "source": "app/browser/event/page.js (7:17) @ onClick

          5 |     <button
          6 |       onClick={() => {
       >  7 |         console.error('trigger an console <%s>', 'error')
            |                 ^
          8 |       }}
          9 |     >
         10 |       click to error",
         "title": "Console Error",
       }
      `)
    }
  })

  it('should capture browser console error in render and dedupe if necessary', async () => {
    const browser = await next.browser('/browser/render')

    await openRedbox(browser)

    const result = await getRedboxResult(browser)
    expect(result).toMatchInlineSnapshot(`
     {
       "callStacks": "Page
     app/browser/render/page.js (4:11)",
       "count": 1,
       "description": "trigger an console.error in render",
       "source": "app/browser/render/page.js (4:11) @ Page

       2 |
       3 | export default function Page() {
     > 4 |   console.error('trigger an console.error in render')
         |           ^
       5 |   return <p>render</p>
       6 | }
       7 |",
       "title": "Console Error",
     }
    `)
  })

  it('should capture browser console error in render and dedupe when multi same errors logged', async () => {
    const browser = await next.browser('/browser/render')

    await openRedbox(browser)

    const result = await getRedboxResult(browser)
    expect(result).toMatchInlineSnapshot(`
     {
       "callStacks": "Page
     app/browser/render/page.js (4:11)",
       "count": 1,
       "description": "trigger an console.error in render",
       "source": "app/browser/render/page.js (4:11) @ Page

       2 |
       3 | export default function Page() {
     > 4 |   console.error('trigger an console.error in render')
         |           ^
       5 |   return <p>render</p>
       6 | }
       7 |",
       "title": "Console Error",
     }
    `)
  })

  it('should capture server replay string error from console error', async () => {
    const browser = await next.browser('/ssr')

    await openRedbox(browser)

    const result = await getRedboxResult(browser)
    expect(result).toMatchInlineSnapshot(`
     {
       "callStacks": "Page
     app/ssr/page.js (4:11)",
       "count": 1,
       "description": "ssr console error:client",
       "source": "app/ssr/page.js (4:11) @ Page

       2 |
       3 | export default function Page() {
     > 4 |   console.error(
         |           ^
       5 |     'ssr console error:' + (typeof window === 'undefined' ? 'server' : 'client')
       6 |   )
       7 |   return <p>ssr</p>",
       "title": "Console Error",
     }
    `)
  })

  it('should capture server replay error instance from console error', async () => {
    const browser = await next.browser('/ssr-error-instance')

    await openRedbox(browser)

    const result = await getRedboxResult(browser)

    expect(result).toMatchInlineSnapshot(`
     {
       "callStacks": "Page
     app/ssr-error-instance/page.js (4:17)",
       "count": 1,
       "description": "Error: page error",
       "source": "app/ssr-error-instance/page.js (4:17) @ Page

       2 |
       3 | export default function Page() {
     > 4 |   console.error(new Error('page error'))
         |                 ^
       5 |   return <p>ssr</p>
       6 | }
       7 |",
       "title": "Console Error",
     }
    `)
  })

  it('should be able to capture rsc logged error', async () => {
    const browser = await next.browser('/rsc')

    await openRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
       {
         "callStacks": "Page
       app/rsc/page.js (2:17)
       JSON.parse
       <anonymous> (0:0)
       Page
       <anonymous> (0:0)",
         "count": 1,
         "description": "[ Server ] Error: boom",
         "source": "app/rsc/page.js (2:17) @ Page

         1 | export default function Page() {
       > 2 |   console.error(new Error('boom'))
           |                 ^
         3 |   return <p>rsc</p>
         4 | }
         5 |",
         "title": "Console Error",
       }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
       {
         "callStacks": "Page
       app/rsc/page.js (2:17)
       JSON.parse
       <anonymous> (0:0)
       Page
       <anonymous> (0:0)",
         "count": 1,
         "description": "[ Server ] Error: boom",
         "source": "app/rsc/page.js (2:17) @ Page

         1 | export default function Page() {
       > 2 |   console.error(new Error('boom'))
           |                 ^
         3 |   return <p>rsc</p>
         4 | }
         5 |",
         "title": "Console Error",
       }
      `)
    }
  })

  it('should display the error message in error event when event.error is not present', async () => {
    const browser = await next.browser('/browser/error-event')
    await browser.elementByCss('button').click()

    await assertNoRedbox(browser)
    await assertNoConsoleErrors(browser)
  })
})
