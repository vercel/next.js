/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('Component Stack in error overlay', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'component-stack')),
    dependencies: {
      react: '19.0.0-beta-4508873393-20240430',
      'react-dom': '19.0.0-beta-4508873393-20240430',
    },
    skipStart: true,
  })

  it('should show a component stack on hydration error', async () => {
    const { cleanup, session } = await sandbox(next)

    await session.waitForAndOpenRuntimeError()

    // If it's too long we can collapse
    if (process.env.TURBOPACK) {
      expect(await session.getRedboxComponentStack()).toMatchInlineSnapshot(`
        "...
          <InnerLayoutRouter>
            <Mismatch>
              <main>
                <Component>
                  <div>
                    <p>
                      "server"
                      "client""
      `)

      await session.toggleCollapseComponentStack()
      expect(await session.getRedboxComponentStack()).toMatchInlineSnapshot(`
        "<Root>
          <ServerRoot>
            <AppRouter>
              <ErrorBoundary>
                <ErrorBoundaryHandler>
                  <Router>
                    <HotReload>
                      <ReactDevOverlay>
                        <DevRootNotFoundBoundary>
                          <NotFoundBoundary>
                            <NotFoundErrorBoundary>
                              <RedirectBoundary>
                                <RedirectErrorBoundary>
                                  <RootLayout>
                                    <html>
                                      <body>
                                        <OuterLayoutRouter>
                                          <RenderFromTemplateContext>
                                            <ScrollAndFocusHandler>
                                              <InnerScrollAndFocusHandler>
                                                <ErrorBoundary>
                                                  <LoadingBoundary>
                                                    <NotFoundBoundary>
                                                      <NotFoundErrorBoundary>
                                                        <RedirectBoundary>
                                                          <RedirectErrorBoundary>
                                                            <InnerLayoutRouter>
                                                              <Mismatch>
                                                                <main>
                                                                  <Component>
                                                                    <div>
                                                                      <p>
                                                                        "server"
                                                                        "client""
      `)
    } else {
      expect(await session.getRedboxComponentStack()).toMatchInlineSnapshot(`
        "...
            <RenderFromTemplateContext>
              <ScrollAndFocusHandler segmentPath={[...]}>
                <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                  <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                    <LoadingBoundary hasLoading={false} loading={undefined} loadingStyles={undefined} loadingScripts={undefined}>
                      <NotFoundBoundary notFound={[...]} notFoundStyles={[...]}>
                        <NotFoundErrorBoundary pathname="/" notFound={[...]} notFoundStyles={[...]} asNotFound={undefined} ...>
                          <RedirectBoundary>
                            <RedirectErrorBoundary router={{...}}>
                              <InnerLayoutRouter parallelRouterKey="children" url="/" tree={[...]} childNodes={Map} ...>
                                <Mismatch>
                                  <main>
                                    <Component>
                                      <div>
                                        <p>
        +                                 client
        -                                 server"
      `)
    }

    await cleanup()
  })
})
