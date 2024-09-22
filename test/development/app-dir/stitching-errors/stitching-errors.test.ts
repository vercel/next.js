import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, assertNoRedbox } from 'next-test-utils'

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
  const stackFrameElements = await browser.elementsByCss(
    '[data-nextjs-call-stack-frame]'
  )
  const stackFramesContent = (
    await Promise.all(stackFrameElements.map((f) => f.innerText()))
  )
    .filter(Boolean)
    .join('\n')

  return normalizeStackTrace(stackFramesContent)
}

// Remove leading spaces in every line of stack trace

describe('stitching errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should log stitched error for browser uncaught errors', async () => {
    const browser = await next.browser('/browser/uncaught')

    await assertHasRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(stackFramesContent).toMatchInlineSnapshot(`
        "useErrorHook
        app/browser/uncaught/page.js 
        Page
        app/browser/uncaught/page.js"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`
        "useThrowError
        app/browser/uncaught/page.js 
        useErrorHook
        app/browser/uncaught/page.js 
        ReactDevOverlay
        ../src/client/components/react-dev-overlay/app/hot-reloader-client.tsx 
        assetPrefix
        ../src/client/components/app-router.tsx 
        actionQueue
        ../src/client/components/app-router.tsx 
        AppRouter
        ../src/client/app-index.tsx"
      `)
    }

    const logs = await browser.log()
    const errorLog = logs.find((log) => {
      return log.message.includes('Error: browser error')
    }).message

    if (process.env.TURBOPACK) {
      expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
        "Error: browser error
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
        at recoverFromConcurrentError 
        at performConcurrentWorkOnRoot 
        at MessagePort.performWorkUntilDeadline 
        The above error occurred in the <Page> component. It was handled by the <ReactDevOverlay> error boundary."
      `)
    } else {
      expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
        "Error: browser error
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
        at recoverFromConcurrentError 
        at performConcurrentWorkOnRoot 
        at MessagePort.performWorkUntilDeadline 
        The above error occurred in the <Page> component. It was handled by the <ReactDevOverlay> error boundary."
      `)
    }
  })

  it('should log stitched error for browser caught errors', async () => {
    const browser = await next.browser('/browser/caught')

    await assertNoRedbox(browser)

    const logs = await browser.log()
    const errorLog = logs.find((log) => {
      return log.message.includes('Error: browser error')
    }).message

    expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
      "Error: browser error
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
      at recoverFromConcurrentError 
      at performConcurrentWorkOnRoot 
      at MessagePort.performWorkUntilDeadline 
      The above error occurred in the <Thrower> component. It was handled by the <MyErrorBoundary> error boundary."
    `)
  })

  it('should log stitched error for SSR errors', async () => {
    const browser = await next.browser('/ssr')

    await assertHasRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(stackFramesContent).toMatchInlineSnapshot(`
        "useErrorHook
        app/ssr/page.js 
        Page
        app/ssr/page.js"
      `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`
        "useThrowError
        app/ssr/page.js 
        useErrorHook
        app/ssr/page.js 
        ReactDevOverlay
        ../src/client/components/react-dev-overlay/app/hot-reloader-client.tsx 
        assetPrefix
        ../src/client/components/app-router.tsx 
        actionQueue
        ../src/client/components/app-router.tsx 
        AppRouter
        ../src/client/app-index.tsx"
      `)
    }

    const logs = await browser.log()
    const errorLog = logs.find((log) => {
      return log.message.includes('Error: ssr error')
    }).message

    expect(normalizeStackTrace(errorLog)).toMatchInlineSnapshot(`
      "Error: ssr error
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
      at recoverFromConcurrentError 
      at performConcurrentWorkOnRoot 
      at MessagePort.performWorkUntilDeadline 
      The above error occurred in the <Page> component. It was handled by the <ReactDevOverlay> error boundary."
    `)
  })
})
