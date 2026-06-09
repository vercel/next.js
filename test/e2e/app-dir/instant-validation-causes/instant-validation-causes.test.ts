import { nextTestSetup } from 'e2e-utils'
import { retry } from '../../../lib/next-test-utils'

describe('instant validation causes', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })
  if (skipped) return
  if (!isNextDev) {
    it.skip('Only implemented in dev', () => {})
    return
  }

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  function getCliOutputSinceMark(): string {
    if (next.cliOutput.length < currentCliOutputIndex) {
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  type ValidationEvent =
    | { type: 'validation_start'; requestId: string; url: string }
    | { type: 'validation_end'; requestId: string; url: string }

  function parseValidationMessages(output: string): ValidationEvent[] {
    const messageRe = /<VALIDATION_MESSAGE>(.*?)<\/VALIDATION_MESSAGE>/g
    const events: ValidationEvent[] = []
    let match: RegExpExecArray | null
    while ((match = messageRe.exec(output)) !== null) {
      try {
        events.push(JSON.parse(match[1]))
      } catch (err) {
        throw new Error(`Failed to parse message '${match[1]}'`, {
          cause: err,
        })
      }
    }
    return events
  }

  function normalizeValidationUrl(url: string): string {
    const parsed = new URL(url, 'http://n')
    parsed.searchParams.delete('_rsc')
    return parsed.pathname + parsed.search + parsed.hash
  }

  async function waitForValidation(targetUrl: string) {
    const parsedTargetUrl = new URL(targetUrl)
    const relativeTargetUrl =
      parsedTargetUrl.pathname + parsedTargetUrl.search + parsedTargetUrl.hash

    const requestId = await retry(
      async () => {
        const events = parseValidationMessages(getCliOutputSinceMark())
        const start = events.find(
          (e) =>
            e.type === 'validation_start' &&
            normalizeValidationUrl(e.url) === relativeTargetUrl
        )
        expect(start).toBeDefined()
        return start!.requestId
      },
      undefined,
      undefined,
      `wait for validation of '${relativeTargetUrl}' to start`
    )

    await retry(
      async () => {
        const events = parseValidationMessages(getCliOutputSinceMark())
        const end = events.find(
          (e) => e.type === 'validation_end' && e.requestId === requestId
        )
        expect(end).toBeDefined()
      },
      undefined,
      undefined,
      'wait for validation to end'
    )
  }

  it('named export - export { unstable_instant }', async () => {
    const browser = await next.browser('/named-export')
    await waitForValidation(await browser.url())
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "cause": [
         {
           "label": "Caused by: Instant Validation",
           "source": "app/named-export/page.tsx (3:26) @ unstable_instant
     > 3 | const unstable_instant = true
         |                          ^",
           "stack": [
             "unstable_instant app/named-export/page.tsx (3:26)",
             "Set.forEach <anonymous>",
           ],
         },
       ],
       "code": "E1319",
       "description": "Next.js encountered runtime data during a navigation.",
       "environmentLabel": "Server",
       "label": "Instant",
       "source": "app/named-export/page.tsx (7:16) @ Page
     >  7 |   await cookies()
          |                ^",
       "stack": [
         "Page app/named-export/page.tsx (7:16)",
       ],
     }
    `)
  })

  it('aliased export - export { instant as unstable_instant }', async () => {
    const browser = await next.browser('/aliased-export')
    await waitForValidation(await browser.url())
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "cause": [
         {
           "label": "Caused by: Instant Validation",
           "source": "app/aliased-export/page.tsx (3:17) @ unstable_instant
     > 3 | const instant = true
         |                 ^",
           "stack": [
             "unstable_instant app/aliased-export/page.tsx (3:17)",
             "Set.forEach <anonymous>",
           ],
         },
       ],
       "code": "E1319",
       "description": "Next.js encountered runtime data during a navigation.",
       "environmentLabel": "Server",
       "label": "Instant",
       "source": "app/aliased-export/page.tsx (7:16) @ Page
     >  7 |   await cookies()
          |                ^",
       "stack": [
         "Page app/aliased-export/page.tsx (7:16)",
       ],
     }
    `)
  })

  it('re-export - export { unstable_instant } from "./config"', async () => {
    const browser = await next.browser('/reexport')
    await waitForValidation(await browser.url())
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "cause": [
         {
           "label": "Caused by: Instant Validation",
           "source": "app/reexport/page.tsx (3:10) @ unstable_instant
     > 3 | export { unstable_instant } from './config'
         |          ^",
           "stack": [
             "unstable_instant app/reexport/page.tsx (3:10)",
             "Set.forEach <anonymous>",
           ],
         },
       ],
       "code": "E1319",
       "description": "Next.js encountered runtime data during a navigation.",
       "environmentLabel": "Server",
       "label": "Instant",
       "source": "app/reexport/page.tsx (6:16) @ Page
     > 6 |   await cookies()
         |                ^",
       "stack": [
         "Page app/reexport/page.tsx (6:16)",
       ],
     }
    `)
  })

  it('indirect export - const instant = _instant; export { instant as unstable_instant }', async () => {
    const browser = await next.browser('/indirect-export')
    await waitForValidation(await browser.url())
    // Ideally we'd be pointing at the original value declaration.
    // We're not following declarations recursively mostly to keep the implementation simpler
    // presuming that almost all configs are just `export const instant = ...`
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "cause": [
         {
           "label": "Caused by: Instant Validation",
           "source": "app/indirect-export/page.tsx (4:17) @ unstable_instant
     > 4 | const instant = _instant
         |                 ^",
           "stack": [
             "unstable_instant app/indirect-export/page.tsx (4:17)",
             "Set.forEach <anonymous>",
           ],
         },
       ],
       "code": "E1319",
       "description": "Next.js encountered runtime data during a navigation.",
       "environmentLabel": "Server",
       "label": "Instant",
       "source": "app/indirect-export/page.tsx (8:16) @ Page
     >  8 |   await cookies()
          |                ^",
       "stack": [
         "Page app/indirect-export/page.tsx (8:16)",
       ],
     }
    `)
  })

  it('does not add an instant stack for random unstable_instant exports', async () => {
    const browser = await next.browser('/not-actual-instant')
    const config = await browser.waitForElementByCss('[data-testid="config"]')
    expect(await config.innerText()).toBe(
      JSON.stringify({ unstable_instant: false })
    )
  })
})
