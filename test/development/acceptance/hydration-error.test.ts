import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import { getRedboxTotalErrorCount, retry } from 'next-test-utils'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18
// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference

describe('Error overlay for hydration errors in Pages router', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('includes a React docs link when hydration error does occur', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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
      '/'
    )
    const { browser } = sandbox
    const logs = await browser.log()
    expect(logs).toEqual(
      expect.arrayContaining([
        {
          message: isReact18
            ? // React 18 has no link in the hydration message
              expect.stringContaining('Warning: Text content did not match.')
            : // TODO: Should probably link to https://nextjs.org/docs/messages/react-hydration-error instead.
              expect.stringContaining(
                'https://react.dev/link/hydration-mismatch'
              ),
          source: 'error',
        },
      ])
    )
  })

  it('should show correct hydration error when client and server render different text', async () => {
    const pageErrors = []
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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
      {
        beforePageLoad: (page) => {
          page.on('pageerror', (error) => {
            pageErrors.push(error)
          })
        },
      }
    )
    const { session, browser } = sandbox

    // Pages Router uses React version without Owner Stacks hence the empty `stack`
    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Mismatch>
           <div>
             <main>
       +       "server"
       -       "client"",
         "count": 2,
         "description": "Text content did not match. Server: "server" Client: "client"",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "...
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
                           <main className="child">
       +                     client
       -                     server
                     ...
                 ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
    expect(pageErrors).toEqual([])

    await session.patch(
      'index.js',
      outdent`
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
          'index.js',
          outdent`
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

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Mismatch>
       >   <div>
       >     <main>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <main> in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "...
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
       +                   <main className="only">
                     ...
                 ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show correct hydration error when client renders an extra text node', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Mismatch>
           <div>
       >     <div>
       >       "second"",
         "count": 3,
         "description": "Expected server HTML to contain a matching text node for "second" in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "...
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
                           <header>
       +                   second
       -                   <footer className="3">
                           ...
                     ...
                 ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show correct hydration error when server renders an extra element', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Mismatch>
       >   <div>",
         "count": 2,
         "description": "Did not expect server HTML to contain a <main> in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
       -                   <main className="only">
                     ...
                 ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show correct hydration error when server renders an extra text node', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
            const isClient = typeof window !== 'undefined'
            export default function Mismatch() {
              return <div className="parent">{!isClient && "only"}</div>;
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Mismatch>
           <div>
       >     <div>
       >       "only"",
         "count": 2,
         "description": "Did not expect server HTML to contain the text node "only" in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
       -                   only
                     ...
                 ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show correct hydration error when server renders an extra text node in an invalid place', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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
      expect(await getRedboxTotalErrorCount(browser)).toBe(
        isReact18
          ? 3
          : // FIXME: Should be 2
            1
      )
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Page>
       >   <table>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <table> in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       +                 <table>
       -                 test
                     ...
                 ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show correct hydration error when server renders an extra whitespace in an invalid place', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
            export default function Page() {
              return (
                <table>
                  {' 123'}
                  <tbody></tbody>
                </table>
              )
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Page>
       >   <table>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <table> in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       +                 <table>
       -                 {" 123"}
                     ...
                 ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show correct hydration error when client renders an extra node inside Suspense content', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Mismatch>
       >   <div>
             <Suspense>
       >       <main>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <main> in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "...
           <PagesDevOverlay>
             <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
               <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                 <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                   <Mismatch>
                     <div className="parent">
                       <Suspense fallback={<p>}>
                         <header>
       +                 <main className="second">
       -                 <footer className="3">
                         ...
                 ...
             ...",
         "count": 1,
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should not show a hydration error when using `useId` in a client component', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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
          'index.js',
          outdent`
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
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Page>
       >   <p>
       >     <p>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <p> in <p>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       >                 <p>
       >                   <p>
                     ...
                 ...",
         "count": 1,
         "description": "In HTML, <p> cannot be a descendant of <p>.
       This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should only show one hydration error when bad nesting happened - div under p', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Page>
           <div>
             <div>
       >       <p>
       >         <div>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <div> in <p>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "...
           <Container fn={function fn}>
             <PagesDevOverlay>
               <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                 <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                   <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                     <Page>
                       <div>
                         <div>
       >                   <p>
       >                     <div>
                   ...
               ...",
         "count": 1,
         "description": "In HTML, <div> cannot be a descendant of <p>.
       This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should only show one hydration error when bad nesting happened - div > tr', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
            export default function Page() {
              return <div><tr></tr></div>
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Page>
       >   <div>
       >     <tr>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <tr> in <div>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       >                 <div>
       >                   <tr>
                     ...
                 ...",
         "count": 1,
         "description": "In HTML, <tr> cannot be a child of <div>.
       This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show the highlighted bad nesting html snippet when bad nesting happened', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'index.js',
          outdent`
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
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Page>
           <p>
             <span>
               <span>
                 <span>
       >           <span>
       >             <p>",
         "count": 3,
         "description": "Expected server HTML to contain a matching <p> in <span>.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "componentStack": "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <PagesDevOverlay>
                 <PagesDevOverlayErrorBoundary onError={function usePagesDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       >                 <p>
                           <span>
                             <span>
                               <span>
                                 <span>
       >                           <p>
                     ...
                 ...",
         "count": 1,
         "description": "In HTML, <p> cannot be a descendant of <p>.
       This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('should show error if script is directly placed under html instead of body', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'pages/_document.js',
          outdent`
            import { Html, Head, Main, NextScript } from 'next/document'
            import Script from 'next/script'
 
            export default function Document() {
              return (
                <Html lang="en">
                  <Head />
                  <body>
                    <Main />
                    <NextScript />
                  </body>
                  <Script
                    src="https://example.com/script.js"
                    strategy="beforeInteractive"
                  />
                </Html>
              )
            }
          `,
        ],
        [
          'index.js',
          outdent`
            export default function Page() {
              return <div>Hello World</div>
            }
          `,
        ],
      ])
    )
    const { session } = sandbox
    // FIXME: Should have a redbox just like with App router
    await session.assertNoRedbox()
  })
})
