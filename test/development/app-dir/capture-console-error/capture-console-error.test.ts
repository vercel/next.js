import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxCallStack,
  getRedboxDescription,
  getRedboxSource,
  getRedboxTotalErrorCount,
  waitForAndOpenRuntimeError,
} from 'next-test-utils'

const isReactExperimental = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

async function getRedboxResult(browser: any) {
  const description = await getRedboxDescription(browser)
  const callStacks = await getRedboxCallStack(browser)
  const count = await getRedboxTotalErrorCount(browser)
  const source = await getRedboxSource(browser)
  const result = {
    count,
    source,
    description,
    callStacks,
  }
  return result
}

describe('app-dir - capture-console-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should capture browser console error and format the error message', async () => {
    const browser = await next.browser('/browser/event')
    await browser.elementByCss('button').click()

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
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
        }
      `)
    } else if (isReactExperimental) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "button
        app/browser/event/page.js (5:6)",
          "count": 1,
          "description": "trigger an console <error>",
          "source": "app/browser/event/page.js (7:17) @ error

           5 |     <button
           6 |       onClick={() => {
        >  7 |         console.error('trigger an console <%s>', 'error')
             |                 ^
           8 |       }}
           9 |     >
          10 |       click to error",
        }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "trigger an console <error>",
          "source": "app/browser/event/page.js (7:17) @ error

           5 |     <button
           6 |       onClick={() => {
        >  7 |         console.error('trigger an console <%s>', 'error')
             |                 ^
           8 |       }}
           9 |     >
          10 |       click to error",
        }
      `)
    }
  })

  it('should capture browser console error in render and dedupe if necessary', async () => {
    const browser = await next.browser('/browser/render')

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
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
        }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "trigger an console.error in render",
          "source": "app/browser/render/page.js (4:11) @ error

          2 |
          3 | export default function Page() {
        > 4 |   console.error('trigger an console.error in render')
            |           ^
          5 |   return <p>render</p>
          6 | }
          7 |",
        }
      `)
    }
  })

  it('should capture server replay console error', async () => {
    const browser = await next.browser('/ssr')

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "ssr console error:client",
          "source": "app/ssr/page.js (4:11) @ Page

          2 |
          3 | export default function Page() {
        > 4 |   console.error(
            |           ^
          5 |     'ssr console error:' + (typeof window === 'undefined' ? 'server' : 'client')
          6 |   )
          7 |   if (typeof window === 'undefined') {",
        }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "ssr console error:client",
          "source": "app/ssr/page.js (4:11) @ error

          2 |
          3 | export default function Page() {
        > 4 |   console.error(
            |           ^
          5 |     'ssr console error:' + (typeof window === 'undefined' ? 'server' : 'client')
          6 |   )
          7 |   if (typeof window === 'undefined') {",
        }
      `)
    }
  })

  it('should be able to capture rsc logged error', async () => {
    const browser = await next.browser('/rsc')

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "[ Server ] Error: boom",
          "source": "app/rsc/page.js (2:17) @ Page

          1 | export default function Page() {
        > 2 |   console.error(new Error('boom'))
            |                 ^
          3 |   return <p>rsc</p>
          4 | }
          5 |",
        }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "[ Server ] Error: boom",
          "source": "app/rsc/page.js (2:17) @ Page

          1 | export default function Page() {
        > 2 |   console.error(new Error('boom'))
            |                 ^
          3 |   return <p>rsc</p>
          4 | }
          5 |",
        }
      `)
    }
  })
})
