import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  openRedbox,
  getRedboxDescription,
  hasRedboxCallStack,
} from 'next-test-utils'

// TODO: parse the location and assert them in the future
// Remove the location `()` part in every line of stack trace;
// Remove the leading spaces in every line of stack trace;
// Remove the trailing spaces in every line of stack trace;
function normalizeStackTrace(trace: string) {
  return trace
    .replace(/\(.*\)/g, '')
    .replace(/^\s+/gm, '')
    .trim()
}

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

describe('app-dir - owner-stack', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  const isNewDevOverlay =
    process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true'

  it('should log stitched error for browser uncaught errors', async () => {
    const browser = await next.browser('/browser/uncaught')

    await assertHasRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    expect(stackFramesContent).toMatchInlineSnapshot(`
     "at useThrowError (app/browser/uncaught/page.js (5:11))
     at useErrorHook (app/browser/uncaught/page.js (10:3))
     at Page (app/browser/uncaught/page.js (14:3))"
    `)

    const logs = await browser.log()
    const errorLog = logs.find((log) => {
      return log.message.includes('Error: browser error')
    }).message

    // TODO(jiwon): Remove this once we have a new dev overlay at stable.
    if (isNewDevOverlay) {
      if (process.env.TURBOPACK) {
        expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
          "%o
          %s Error: browser error
          at useThrowError 
          at useErrorHook 
          at Page 
          at react-stack-bottom-frame 
          at renderWithHooks 
          at updateFunctionComponent 
          at beginWork 
          at runWithFiberInDEV 
          at performUnitOfWork 
          at workLoopSync 
          at renderRootSync 
          at performWorkOnRoot 
          at performWorkOnRootViaSchedulerTask 
          at MessagePort.performWorkUntilDeadline  The above error occurred in the <Page> component. It was handled by the <DevOverlayErrorBoundary> error boundary."
        `)
      } else {
        expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
          "%o
          %s Error: browser error
          at useThrowError 
          at useErrorHook 
          at Page 
          at react-stack-bottom-frame 
          at renderWithHooks 
          at updateFunctionComponent 
          at beginWork 
          at runWithFiberInDEV 
          at performUnitOfWork 
          at workLoopSync 
          at renderRootSync 
          at performWorkOnRoot 
          at performWorkOnRootViaSchedulerTask 
          at MessagePort.performWorkUntilDeadline  The above error occurred in the <Page> component. It was handled by the <DevOverlayErrorBoundary> error boundary."
      `)
      }
    } else {
      if (process.env.TURBOPACK) {
        expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
          "%o
          %s Error: browser error
          at useThrowError 
          at useErrorHook 
          at Page 
          at react-stack-bottom-frame 
          at renderWithHooks 
          at updateFunctionComponent 
          at beginWork 
          at runWithFiberInDEV 
          at performUnitOfWork 
          at workLoopSync 
          at renderRootSync 
          at performWorkOnRoot 
          at performWorkOnRootViaSchedulerTask 
          at MessagePort.performWorkUntilDeadline  The above error occurred in the <Page> component. It was handled by the <ReactDevOverlay> error boundary."
        `)
      } else {
        expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
          "%o
          %s Error: browser error
          at useThrowError 
          at useErrorHook 
          at Page 
          at react-stack-bottom-frame 
          at renderWithHooks 
          at updateFunctionComponent 
          at beginWork 
          at runWithFiberInDEV 
          at performUnitOfWork 
          at workLoopSync 
          at renderRootSync 
          at performWorkOnRoot 
          at performWorkOnRootViaSchedulerTask 
          at MessagePort.performWorkUntilDeadline  The above error occurred in the <Page> component. It was handled by the <ReactDevOverlay> error boundary."
      `)
      }
    }
  })

  it('should log stitched error for browser caught errors', async () => {
    const browser = await next.browser('/browser/caught')

    await assertNoRedbox(browser)

    const logs = await browser.log()
    const errorLog = logs.find((log) => {
      return log.message.includes('Error: browser error')
    }).message

    await openRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    if (isTurbopack) {
      expect(stackFramesContent).toMatchInlineSnapshot(`
       "at useThrowError (app/browser/caught/page.js (34:11))
       at useErrorHook (app/browser/caught/page.js (39:3))
       at Thrower (app/browser/caught/page.js (29:3))
       at Inner (app/browser/caught/page.js (23:7))
       at Page (app/browser/caught/page.js (43:10))"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`
       "at useThrowError (app/browser/caught/page.js (34:11))
       at useErrorHook (app/browser/caught/page.js (39:3))
       at Thrower (app/browser/caught/page.js (29:3))
       at Inner (app/browser/caught/page.js (23:8))
       at Page (app/browser/caught/page.js (43:11))"
      `)
    }

    expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
      "%o
      %s Error: browser error
      at useThrowError 
      at useErrorHook 
      at Thrower 
      at react-stack-bottom-frame 
      at renderWithHooks 
      at updateFunctionComponent 
      at beginWork 
      at runWithFiberInDEV 
      at performUnitOfWork 
      at workLoopSync 
      at renderRootSync 
      at performWorkOnRoot 
      at performWorkOnRootViaSchedulerTask 
      at MessagePort.performWorkUntilDeadline  The above error occurred in the <Thrower> component. It was handled by the <MyErrorBoundary> error boundary."
    `)
  })

  it('should log stitched error for SSR errors', async () => {
    const browser = await next.browser('/ssr')

    await assertHasRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    expect(stackFramesContent).toMatchInlineSnapshot(`
     "at useThrowError (app/ssr/page.js (4:9))
     at useErrorHook (app/ssr/page.js (8:3))
     at Page (app/ssr/page.js (12:3))"
    `)

    const logs = await browser.log()
    const errorLog = logs.find((log) => {
      return log.message.includes('Error: ssr error')
    }).message

    if (isNewDevOverlay) {
      expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
       "%o
       %s Error: ssr error
       at useThrowError 
       at useErrorHook 
       at Page 
       at react-stack-bottom-frame 
       at renderWithHooks 
       at updateFunctionComponent 
       at beginWork 
       at runWithFiberInDEV 
       at performUnitOfWork 
       at workLoopSync 
       at renderRootSync 
       at performWorkOnRoot 
       at performWorkOnRootViaSchedulerTask 
       at MessagePort.performWorkUntilDeadline  The above error occurred in the <Page> component. It was handled by the <DevOverlayErrorBoundary> error boundary."
      `)
    } else {
      expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
       "%o
       %s Error: ssr error
       at useThrowError 
       at useErrorHook 
       at Page 
       at react-stack-bottom-frame 
       at renderWithHooks 
       at updateFunctionComponent 
       at beginWork 
       at runWithFiberInDEV 
       at performUnitOfWork 
       at workLoopSync 
       at renderRootSync 
       at performWorkOnRoot 
       at performWorkOnRootViaSchedulerTask 
       at MessagePort.performWorkUntilDeadline  The above error occurred in the <Page> component. It was handled by the <ReactDevOverlay> error boundary."
    `)
    }
  })

  it('should capture unhandled promise rejections', async () => {
    const browser = await next.browser('/browser/reject-promise')

    await openRedbox(browser)

    const description = await getRedboxDescription(browser)
    expect(description).toMatchInlineSnapshot(`"string in rejected promise"`)

    // Promise rejection has no owner stack
    const stackFramesContent = await getStackFramesContent(browser)
    expect(stackFramesContent).toMatchInlineSnapshot(`""`)
  })
})
