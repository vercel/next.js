import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  expandCallStackDetails,
  getRedboxCallStack,
  getRedboxCategory,
  getRedboxDescription,
  getRedboxLocation,
  getRedboxCodeFrame,
  getRedboxOriginalCallStack,
  normalizeCodeLocInfo,
} from '../../lib/next-test-utils'

// Goal: Write a test for error o11y that ensures we have everything.
// Requirements:
// - 1 expect, check every field
// - path match of callstack
// - callstack expanded & copied value

describe('error o11y in client component', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should display error o11y for client component app code in Turbopack', async () => {
    const browser = await next.browser('/client/app-code')
    await assertHasRedbox(browser)
    await expandCallStackDetails(browser)
    await browser.waitForElementByCss('[data-nextjs-frame-source]')
    // get innerText of each element
    const callStackFrameSources = await browser.elementsByCss(
      '[data-nextjs-frame-source]'
    )
    const callStackFrameSourceTexts = await Promise.all(
      callStackFrameSources.map((f) => f.innerText())
    )

    let expanded = await getRedboxCallStack(browser)

    for (const source of callStackFrameSourceTexts) {
      expanded = expanded.replace(source, '** (**)')
    }

    const expectedRedbox = {
      category: await getRedboxCategory(browser),
      description: await getRedboxDescription(browser),
      location: await getRedboxLocation(browser),
      codeFrame: await getRedboxCodeFrame(browser),
      callStack: {
        copied: normalizeCodeLocInfo(await getRedboxOriginalCallStack(browser)),
        expanded,
      },
    }

    expect(expectedRedbox).toMatchInlineSnapshot(`
      {
        "callStack": {
          "copied": "Error: runtime error in client component app code
          at Page (**)
          at react-stack-bottom-frame (**)
          at renderWithHooks (**)
          at updateFunctionComponent (**)
          at beginWork (**)
          at runWithFiberInDEV (**)
          at performUnitOfWork (**)
          at workLoopSync (**)
          at renderRootSync (**)
          at recoverFromConcurrentError (**)
          at performConcurrentWorkOnRoot (**)
          at MessagePort.performWorkUntilDeadline (**)",
          "expanded": "react-stack-bottom-frame
      ** (**)
      renderWithHooks
      ** (**)
      updateFunctionComponent
      ** (**)
      beginWork
      ** (**)
      runWithFiberInDEV
      ** (**)
      performUnitOfWork
      ** (**)
      workLoopSync
      ** (**)
      renderRootSync
      ** (**)
      recoverFromConcurrentError
      ** (**)
      performConcurrentWorkOnRoot
      ** (**)
      MessagePort.performWorkUntilDeadline
      ** (**)",
        },
        "category": "Unhandled Runtime Error",
        "codeFrame": "  2 |
        3 | export default function Page() {
      > 4 |   throw Error('runtime error in client component app code')
          |         ^
        5 | }
        6 |",
        "description": "Error: runtime error in client component app code",
        "location": "app/client/app-code/page.tsx (4:9) @ Error",
      }
    `)
  })
})
