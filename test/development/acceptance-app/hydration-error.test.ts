/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import { getRedboxTotalErrorCount, retry } from 'next-test-utils'

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
    await session.openRedbox()

    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
    )

    expect(await session.getRedboxDescriptionWarning()).toMatchInlineSnapshot(`
      "- A server/client branch \`if (typeof window !== 'undefined')\`.
      - Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
      - Date formatting in a user's locale which doesn't match the server.
      - External changing data without sending a snapshot of it along with the HTML.
      - Invalid HTML tag nesting.

      It can also happen if the client has a browser extension installed which messes with the HTML before React loaded."
    `)

    expect(await session.getRedboxErrorLink()).toMatchInlineSnapshot(
      `"See more info here: https://nextjs.org/docs/messages/react-hydration-error"`
    )

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
    `)

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
    const { session, browser } = sandbox
    await session.openRedbox()

    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
    `)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
    )
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
    const { session, browser } = sandbox
    await session.openRedbox()

    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "...
           <HotReload assetPrefix="" globalError={[...]}>
             <ReactDevOverlay state={{nextId:1, ...}} dispatcher={{...}} globalError={[...]}>
               <DevOverlayErrorBoundary devOverlay={<ShadowPortal>} globalError={[...]} ...>
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
                 ..."
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "...
           <HotReload assetPrefix="" globalError={[...]}>
             <ReactDevOverlay state={{nextId:1, ...}} dispatcher={{...}} globalError={[...]}>
               <DevOverlayErrorBoundary devOverlay={<ShadowPortal>} globalError={[...]} ...>
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
                 ..."
      `)
    }

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
    )
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
    const { session, browser } = sandbox
    await session.openRedbox()

    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
    `)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
    )
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
    const { session, browser } = sandbox
    await session.openRedbox()

    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
    `)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
    )
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
    const { session, browser } = sandbox
    await session.openRedbox()

    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
    )

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
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
    const { session, browser } = sandbox
    await session.openRedbox()

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(2)
    })

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
     "In HTML, text nodes cannot be a child of <tr>.
     This will cause a hydration error."
    `)

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                           ..."
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
    const { session, browser } = sandbox
    await session.openRedbox()

    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
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
    const { session } = sandbox
    await session.openRedbox()

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                         ..."
    `)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
    )
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
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).not.toInclude(
      'Warning: Prop `%s` did not match. Server: %s Client: %s'
    )
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

    const { session, browser } = sandbox
    await session.openRedbox()

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(2)
    })

    const description = await session.getRedboxDescription()
    expect(description).toContain(
      'In HTML, <p> cannot be a descendant of <p>.\nThis will cause a hydration error.'
    )

    const pseudoHtml = await session.getRedboxComponentStack()

    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
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

    const { session, browser } = sandbox
    await session.openRedbox()

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(2)
    })

    const description = await session.getRedboxDescription()
    expect(description).toContain(
      'In HTML, <div> cannot be a descendant of <p>.\nThis will cause a hydration error.'
    )

    const pseudoHtml = await session.getRedboxComponentStack()

    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                           ..."
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

    const { session, browser } = sandbox
    await session.openRedbox()

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(2)
    })

    const description = await session.getRedboxDescription()
    expect(description).toMatchInlineSnapshot(`
     "In HTML, <tr> cannot be a child of <div>.
     This will cause a hydration error."
    `)

    const pseudoHtml = await session.getRedboxComponentStack()

    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
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

    const { session, browser } = sandbox
    await session.openRedbox()

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(3)
    })

    const description = await session.getRedboxDescription()
    expect(description).toContain(
      'In HTML, <p> cannot be a descendant of <p>.\nThis will cause a hydration error.'
    )

    const pseudoHtml = await session.getRedboxComponentStack()
    expect(pseudoHtml).toMatchInlineSnapshot(`
     "...
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
                             ..."
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
    const { session, browser } = sandbox
    await session.openRedbox()

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(
        // One error for "Cannot render a sync or defer <script>"
        3
      )
    })

    // TODO: assert on 2nd error being "In HTML, <script> cannot be a child of <html>."
    // TODO: assert on 3rd error that's specific to owner stacks
    const description = await session.getRedboxDescription()
    expect(description).toMatchInlineSnapshot(
      `"Cannot render a sync or defer <script> outside the main document without knowing its order. Try adding async="" or moving it into the root <head> tag."`
    )

    const pseudoHtml = await session.getRedboxComponentStack()
    // 1st error has no component context.
    expect(pseudoHtml).toMatchInlineSnapshot(`null`)
  })
})
