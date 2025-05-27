/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import { getToastErrorCount, retry } from 'next-test-utils'

describe('Error overlay for hydration errors in App router', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('includes a React docs link when hydration error does occur', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return (
                <div className="parent">
                  <main className="child">{isClient ? "client" : "server"}</main>
                </div>
              );
            }
          `,
        ],
      ]),
      '/',
      { pushErrorAsConsoleLog: true }
    )
    const { browser } = sandbox
    const logs = await browser.log()
    expect(logs).toEqual(
      expect.arrayContaining([
        {
          // TODO: Should probably link to https://nextjs.org/docs/messages/react-hydration-error instead.
          message: expect.stringContaining(
            'https://react.dev/link/hydration-mismatch'
          ),
          source: 'error',
        },
      ])
    )
  })

  it('should show correct hydration error when client and server render different text', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return (
                <div className="parent">
                  <main className="child">{isClient ? "client" : "server"}</main>
                </div>
              );
            }
          `,
        ],
      ])
    )
    const { session, browser } = sandbox

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Mismatch} searchParams={{}} params={{}}>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
                                   <main className="child">
     +                               client
     -                               server
                             ...",
       "description": "Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/page.js (6:7) @ Mismatch
     > 6 |       <main className="child">{isClient ? "client" : "server"}</main>
         |       ^",
       "stack": [
         "main <anonymous> (0:0)",
         "Mismatch app/page.js (6:7)",
       ],
     }
    `)
    expect(await session.getRedboxErrorLink()).toMatchInlineSnapshot(
      `"See more info here: https://nextjs.org/docs/messages/react-hydration-error"`
    )

    await session.patch(
      'app/page.js',
      outdent`
      'use client'
      export default function Mismatch() {
        return (
          <div className="parent">
            <main className="child">Value</main>
          </div>
        );
      }
    `
    )

    await session.assertNoRedbox()

    expect(await browser.elementByCss('.child').text()).toBe('Value')
  })

  it('should show correct hydration error when client renders an extra element', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return (
                <div className="parent">
                  {isClient && <main className="only" />}
                </div>
              );
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Mismatch} searchParams={{}} params={{}}>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
     +                             <main className="only">
                             ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/page.js (6:20) @ Mismatch
     > 6 |       {isClient && <main className="only" />}
         |                    ^",
       "stack": [
         "main <anonymous> (0:0)",
         "Mismatch app/page.js (6:20)",
       ],
     }
    `)
  })

  it('should show correct hydration error when extra attributes set on server', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/layout.js',
          outdent`
          'use client'
          const isServer = typeof window === 'undefined'
          export default function Root({ children }) {
            return (
              <html 
                {...(isServer ? ({ className: 'server-html'}) : undefined)}
              >
                <body>{children}</body>
              </html>
            )
          }
          `,
        ],
        ['app/page.js', `export default function Page() { return 'page' }`],
      ])
    )
    const { browser } = sandbox

    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "componentStack": "...
           <HotReload assetPrefix="" globalError={[...]}>
             <AppDevOverlay state={{nextId:1, ...}} globalError={[...]}>
               <AppDevOverlayErrorBoundary globalError={[...]} onError={function}>
                 <ReplaySsrOnlyErrors>
                 <DevRootHTTPAccessFallbackBoundary>
                   <HTTPAccessFallbackBoundary notFound={<NotAllowedRootHTTPFallbackError>}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={<NotAllowedRootHTTPFallbackError>} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <Head>
                           <script>
                           <script>
                           <script>
                           <ClientSegmentRoot Component={function Root} slots={{...}} params={{}}>
                             <Root params={Promise}>
                               <html
       -                         className="server-html"
                               >
                           ...
               ...",
         "description": "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/layout.js (5:5) @ Root
       > 5 |     <html
           |     ^",
         "stack": [
           "html <anonymous> (0:0)",
           "Root app/layout.js (5:5)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "componentStack": "...
           <HotReload assetPrefix="" globalError={[...]}>
             <AppDevOverlay state={{nextId:1, ...}} globalError={[...]}>
               <AppDevOverlayErrorBoundary globalError={[...]} onError={function}>
                 <ReplaySsrOnlyErrors>
                 <DevRootHTTPAccessFallbackBoundary>
                   <HTTPAccessFallbackBoundary notFound={<NotAllowedRootHTTPFallbackError>}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={<NotAllowedRootHTTPFallbackError>} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <Head>
                           <ClientSegmentRoot Component={function Root} slots={{...}} params={{}}>
                             <Root params={Promise}>
                               <html
       -                         className="server-html"
                               >
                           ...
               ...",
         "description": "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/layout.js (5:5) @ Root
       > 5 |     <html
           |     ^",
         "stack": [
           "html <anonymous> (0:0)",
           "Root app/layout.js (5:5)",
         ],
       }
      `)
    }
  })

  it('should show correct hydration error when client renders an extra text node', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return (
                <div className="parent">
                  <header className="1" />
                  {isClient && "second"}
                  <footer className="3" />
                </div>
              );
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Mismatch} searchParams={{}} params={{}}>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
                                   <header>
     +                             second
     -                             <footer className="3">
                                   ...
                             ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/page.js (5:5) @ Mismatch
     > 5 |     <div className="parent">
         |     ^",
       "stack": [
         "div <anonymous> (0:0)",
         "Mismatch app/page.js (5:5)",
       ],
     }
    `)
  })

  it('should show correct hydration error when server renders an extra element', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return (
                <div className="parent">
                  {!isClient && <main className="only" />}
                </div>
              );
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Mismatch} searchParams={{}} params={{}}>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
     -                             <main className="only">
                             ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/page.js (5:5) @ Mismatch
     > 5 |     <div className="parent">
         |     ^",
       "stack": [
         "div <anonymous> (0:0)",
         "Mismatch app/page.js (5:5)",
       ],
     }
    `)
  })

  it('should show correct hydration error when server renders an extra text node', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return <div className="parent">{!isClient && "only"}</div>;
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Mismatch} searchParams={{}} params={{}}>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
     -                             only
                             ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/page.js (4:10) @ Mismatch
     > 4 |   return <div className="parent">{!isClient && "only"}</div>;
         |          ^",
       "stack": [
         "div <anonymous> (0:0)",
         "Mismatch app/page.js (4:10)",
       ],
     }
    `)
  })

  it('should show correct hydration error when server renders an extra text node in an invalid place', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            export default function Page() {
              return (
                <table>
                  <tbody>
                    <tr>test</tr>
                  </tbody>
                </table>
              )
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <ScrollAndFocusHandler segmentPath={[...]}>
           <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
             <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
               <LoadingBoundary loading={null}>
                 <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                   <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                     <RedirectBoundary>
                       <RedirectErrorBoundary router={{...}}>
                         <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                           <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                             <Page params={Promise} searchParams={Promise}>
                               <table>
                                 <tbody>
                                   <tr>
     >                               test
                           ...",
         "description": "In HTML, text nodes cannot be a child of <tr>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/page.js (6:9) @ Page
     > 6 |         <tr>test</tr>
         |         ^",
         "stack": [
           "tr <anonymous> (0:0)",
           "Page app/page.js (6:9)",
         ],
       },
       {
         "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                               <Page params={Promise} searchParams={Promise}>
     +                           <table>
     -                           test
                             ...",
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/page.js (4:5) @ Page
     > 4 |     <table>
         |     ^",
         "stack": [
           "table <anonymous> (0:0)",
           "Page app/page.js (4:5)",
         ],
       },
     ]
    `)
  })

  it('should show correct hydration error when server renders an extra whitespace in an invalid place', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            export default function Page() {
              return (
                <table>
                  {' '}
                  <tbody></tbody>
                </table>
              )
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                               <Page params={Promise} searchParams={Promise}>
     >                           <table>
     >                             {" "}
                                   ...
                             ...",
       "description": "In HTML, whitespace text nodes cannot be a child of <table>. Make sure you don't have any extra whitespace between tags on each line of your source code.
     This will cause a hydration error.",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/page.js (4:5) @ Page
     > 4 |     <table>
         |     ^",
       "stack": [
         "table <anonymous> (0:0)",
         "Page app/page.js (4:5)",
       ],
     }
    `)
  })

  it('should show correct hydration error when client renders an extra node inside Suspense content', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            import React from "react"
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return (
                <div className="parent">
                  <React.Suspense fallback={<p>Loading...</p>}>
                    <header className="1" />
                    {isClient && <main className="second" />}
                    <footer className="3" />
                  </React.Suspense>
                </div>
              );
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
           <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
             <LoadingBoundary loading={null}>
               <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                 <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} unauthorized={undefined} ...>
                   <RedirectBoundary>
                     <RedirectErrorBoundary router={{...}}>
                       <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                         <ClientPageRoot Component={function Mismatch} searchParams={{}} params={{}}>
                           <Mismatch params={Promise} searchParams={Promise}>
                             <div className="parent">
                               <Suspense fallback={<p>}>
                                 <header>
     +                           <main className="second">
     -                           <footer className="3">
                                 ...
                         ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/page.js (9:22) @ Mismatch
     >  9 |         {isClient && <main className="second" />}
          |                      ^",
       "stack": [
         "main <anonymous> (0:0)",
         "Mismatch app/page.js (9:22)",
       ],
     }
    `)
  })

  it('should not show a hydration error when using `useId` in a client component', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'

            import { useId } from "react"

            export default function Page() {
              let id = useId();
              return (
                <div className="parent" data-id={id}>
                  Hello World
                </div>
              );
            }
          `,
        ],
      ])
    )

    const { browser } = sandbox
    const logs = await browser.log()
    const errors = logs.filter((x) => x.source === 'error')
    expect(errors).toEqual([])
  })

  it('should only show one hydration error when bad nesting happened - p under p', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'

            export default function Page() {
              return (
                <p>
                  <p>Nested p tags</p>
                </p>
              )
            }
          `,
        ],
      ])
    )

    const { browser } = sandbox

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                               <Page params={Promise} searchParams={Promise}>
     >                           <p>
     >                             <p>
                             ...",
         "description": "In HTML, <p> cannot be a descendant of <p>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/page.js (6:7) @ Page
     > 6 |       <p>Nested p tags</p>
         |       ^",
         "stack": [
           "p <anonymous> (0:0)",
           "Page app/page.js (6:7)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/page.js (6:7) @ Page
     > 6 |       <p>Nested p tags</p>
         |       ^",
         "stack": [
           "p <anonymous> (0:0)",
           "Page app/page.js (6:7)",
         ],
       },
     ]
    `)
  })

  it('should only show one hydration error when bad nesting happened - div under p', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'

            export default function Page() {
              return (
                <div>
                  <div>
                    <p>
                      <div>Nested div under p tag</div>
                    </p>
                  </div>
                </div>
              )
            }
          `,
        ],
      ])
    )

    const { browser } = sandbox

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <ScrollAndFocusHandler segmentPath={[...]}>
           <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
             <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
               <LoadingBoundary loading={null}>
                 <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                   <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                     <RedirectBoundary>
                       <RedirectErrorBoundary router={{...}}>
                         <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                           <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                             <Page params={Promise} searchParams={Promise}>
                               <div>
                                 <div>
     >                             <p>
     >                               <div>
                           ...",
         "description": "In HTML, <div> cannot be a descendant of <p>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/page.js (8:11) @ Page
     >  8 |           <div>Nested div under p tag</div>
          |           ^",
         "stack": [
           "div <anonymous> (0:0)",
           "Page app/page.js (8:11)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/page.js (8:11) @ Page
     >  8 |           <div>Nested div under p tag</div>
          |           ^",
         "stack": [
           "div <anonymous> (0:0)",
           "Page app/page.js (8:11)",
         ],
       },
     ]
    `)
  })

  it('should only show one hydration error when bad nesting happened - div > tr', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            export default function Page() {
              return <div><tr></tr></div>
            }
          `,
        ],
      ])
    )

    const { browser } = sandbox

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                               <Page params={Promise} searchParams={Promise}>
     >                           <div>
     >                             <tr>
                             ...",
         "description": "In HTML, <tr> cannot be a child of <div>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/page.js (3:15) @ Page
     > 3 |   return <div><tr></tr></div>
         |               ^",
         "stack": [
           "tr <anonymous> (0:0)",
           "Page app/page.js (3:15)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/page.js (3:15) @ Page
     > 3 |   return <div><tr></tr></div>
         |               ^",
         "stack": [
           "tr <anonymous> (0:0)",
           "Page app/page.js (3:15)",
         ],
       },
     ]
    `)
  })

  it('should show the highlighted bad nesting html snippet when bad nesting happened', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'

            export default function Page() {
              return (
                <p><span><span><span><span><p>hello world</p></span></span></span></span></p>
              )
            }
          `,
        ],
      ])
    )

    const { browser } = sandbox

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(3)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <RenderFromTemplateContext>
           <ScrollAndFocusHandler segmentPath={[...]}>
             <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
               <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                 <LoadingBoundary loading={null}>
                   <HTTPAccessFallbackBoundary notFound={[...]} forbidden={undefined} unauthorized={undefined}>
                     <HTTPAccessFallbackErrorBoundary pathname="/" notFound={[...]} forbidden={undefined} ...>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/" tree={[...]} cacheNode={{lazyData:null, ...}} segmentPath={[...]}>
                             <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                               <Page params={Promise} searchParams={Promise}>
     >                           <p>
                                   <span>
                                     <span>
                                       <span>
                                         <span>
     >                                     <p>
                             ...",
         "description": "In HTML, <p> cannot be a descendant of <p>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/page.js (5:32) @ Page
     > 5 |     <p><span><span><span><span><p>hello world</p></span></span></span></span></p>
         |                                ^",
         "stack": [
           "p <anonymous> (0:0)",
           "Page app/page.js (5:32)",
         ],
       },
       {
         "description": "<p> cannot contain a nested <p>.
     See this log for the ancestor stack trace.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/page.js (5:5) @ Page
     > 5 |     <p><span><span><span><span><p>hello world</p></span></span></span></span></p>
         |     ^",
         "stack": [
           "p <anonymous> (0:0)",
           "Page app/page.js (5:5)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/page.js (5:32) @ Page
     > 5 |     <p><span><span><span><span><p>hello world</p></span></span></span></span></p>
         |                                ^",
         "stack": [
           "p <anonymous> (0:0)",
           "Page app/page.js (5:32)",
         ],
       },
     ]
    `)
  })

  it('should show error if script is directly placed under html instead of body', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/layout.js',
          outdent`
            import Script from 'next/script'

            export default function Layout({ children }) {
              return (
                <html>
                  <body>{children}</body>
                  <Script
                    src="https://example.com/script.js"
                    strategy="beforeInteractive"
                  />
                </html>
              )
            }
          `,
        ],
        [
          'app/page.js',
          outdent`
            export default function Page() {
              return <div>Hello World</div>
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(
        // One error for "Cannot render a sync or defer <script>"
        3
      )
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "description": "Cannot render a sync or defer <script> outside the main document without knowing its order. Try adding async="" or moving it into the root <head> tag.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/layout.js (7:7) @ Layout
     >  7 |       <Script
          |       ^",
         "stack": [
           "Layout app/layout.js (7:7)",
         ],
       },
       {
         "componentStack": "...
         <HotReload assetPrefix="" globalError={[...]}>
           <AppDevOverlay state={{nextId:1, ...}} globalError={[...]}>
             <AppDevOverlayErrorBoundary globalError={[...]} onError={function}>
               <ReplaySsrOnlyErrors>
               <DevRootHTTPAccessFallbackBoundary>
                 <HTTPAccessFallbackBoundary notFound={<NotAllowedRootHTTPFallbackError>}>
                   <HTTPAccessFallbackErrorBoundary pathname="/" notFound={<NotAllowedRootHTTPFallbackError>} ...>
                     <RedirectBoundary>
                       <RedirectErrorBoundary router={{...}}>
                         <Head>${isTurbopack ? '\n                         <script>\n                         <script>' : ''}
                         <Layout>
     >                     <html>
                             <body>
                             <Script src="https://ex..." strategy="beforeInte...">
     >                         <script nonce={undefined} dangerouslySetInnerHTML={{__html:"(self.__ne..."}}>
                         ...
             ...",
         "description": "In HTML, <script> cannot be a child of <html>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/layout.js (7:7) @ Layout
     >  7 |       <Script
          |       ^",
         "stack": [
           "script <anonymous> (0:0)",
           "Layout app/layout.js (7:7)",
         ],
       },
       {
         "description": "<html> cannot contain a nested <script>.
     See this log for the ancestor stack trace.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/layout.js (5:5) @ Layout
     > 5 |     <html>
         |     ^",
         "stack": [
           "html <anonymous> (0:0)",
           "Layout app/layout.js (5:5)",
         ],
       },
     ]
    `)
  })
})
