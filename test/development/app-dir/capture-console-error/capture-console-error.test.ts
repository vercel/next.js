import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxCallStack,
  getRedboxDescription,
  getRedboxSource,
  getRedboxTotalErrorCount,
  waitForAndOpenRuntimeError,
} from 'next-test-utils'

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

  it('should error on capture browser console error and format the error message', async () => {
    const browser = await next.browser('/browser')
    await browser.elementByCss('button').click()

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "Error: trigger an console <error>",
          "source": "app/browser/page.js (7:17) @ onClick

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
          "description": "Error: trigger an console <error>",
          "source": "app/browser/page.js (7:17) @ error

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

  it('should error on capture server replay console error', async () => {
    const browser = await next.browser('/ssr')

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 2,
          "description": "Error: ssr console error:client",
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
          "count": 2,
          "description": "Error: ssr console error:client",
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
})
