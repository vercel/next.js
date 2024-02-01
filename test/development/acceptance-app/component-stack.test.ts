/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('Component Stack in error overlay', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'component-stack')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  })

  it('should show a component stack on hydration error', async () => {
    const { cleanup, session } = await sandbox(next)

    await session.waitForAndOpenRuntimeError()

    if (process.env.TURBOPACK) {
      expect(await session.getRedboxComponentStack()).toMatchInlineSnapshot(`
        "p
        div
        Component
        main
        InnerLayoutRouter
        RedirectErrorBoundary
        RedirectBoundary
        NotFoundErrorBoundary
        NotFoundBoundary
        LoadingBoundary
        ErrorBoundary
        InnerScrollAndFocusHandler
        ScrollAndFocusHandler
        RenderFromTemplateContext
        OuterLayoutRouter
        body
        html
        RedirectErrorBoundary
        RedirectBoundary
        NotFoundErrorBoundary
        NotFoundBoundary
        DevRootNotFoundBoundary
        ReactDevOverlay
        HotReload
        Router
        ErrorBoundaryHandler
        ErrorBoundary
        AppRouter
        ServerRoot
        RSCComponent
        Root"
      `)
    } else {
      expect(await session.getRedboxComponentStack()).toMatchInlineSnapshot(`
        "p
        div
        Component
        main"
      `)
    }

    await cleanup()
  })
})
