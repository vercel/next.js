import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import { getRedboxTotalErrorCount, retry } from 'next-test-utils'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18
// TODO(new-dev-overlay): Remove this once old dev overlay fork is removed
const isNewDevOverlay =
  process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true'
// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference

describe('Error overlay for hydration errors in Pages router', () => {
  const { next, isTurbopack } = nextTestSetup({
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
      '/',
      { pushErrorAsConsoleLog: true }
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
      ])
    )
    const { session, browser } = sandbox

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 2 : 1)

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Text content did not match. Server: "server" Client: "client""`
      )
    } else {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )
    }

    if (isReact18) {
      expect(await session.getRedboxDescriptionWarning()).toMatchInlineSnapshot(
        `undefined`
      )
    } else {
      expect(await session.getRedboxDescriptionWarning())
        .toMatchInlineSnapshot(`
          "- A server/client branch \`if (typeof window !== 'undefined')\`.
          - Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
          - Date formatting in a user's locale which doesn't match the server.
          - External changing data without sending a snapshot of it along with the HTML.
          - Invalid HTML tag nesting.

          It can also happen if the client has a browser extension installed which messes with the HTML before React loaded."
        `)
    }
    expect(await session.getRedboxErrorLink()).toMatchInlineSnapshot(
      `"See more info here: https://nextjs.org/docs/messages/react-hydration-error"`
    )

    const pseudoHtml = await session.getRedboxComponentStack()

    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Mismatch>
           <div>
             <main>
       +       "server"
       -       "client""
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "...
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
                           <main className="child">
       +                     client
       -                     server
                     ...
                 ..."
      `)
    }
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    await retry(async () => {
      await expect(await getRedboxTotalErrorCount(browser)).toBe(
        isReact18 ? 3 : 1
      )
    })

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Mismatch>
       >   <div>
       >     <main>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "...
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
       +                   <main className="only">
                     ...
                 ..."
      `)
    }

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <main> in <div>."`
      )
    } else {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    await retry(async () => {
      await expect(await getRedboxTotalErrorCount(browser)).toBe(
        isReact18 ? 3 : 1
      )
    })

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Mismatch>
           <div>
       >     <div>
       >       "second""
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "...
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
                           <header>
       +                   second
       -                   <footer className="3">
                           ...
                     ...
                 ..."
      `)
    }

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching text node for "second" in <div>."`
      )
    } else {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 2 : 1)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Mismatch>
       >   <div>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
       -                   <main className="only">
                     ...
                 ..."
      `)
    }

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Did not expect server HTML to contain a <main> in <div>."`
      )
    } else {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 2 : 1)

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Did not expect server HTML to contain the text node "only" in <div>."`
      )
    } else {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )
    }

    const pseudoHtml = await session.getRedboxComponentStack()

    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Mismatch>
           <div>
       >     <div>
       >       "only""
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Mismatch} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Mismatch>
                         <div className="parent">
       -                   only
                     ...
                 ..."
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()

    await retry(async () => {
      await expect(await getRedboxTotalErrorCount(browser)).toBe(
        isReact18
          ? 3
          : // FIXME: Should be 2
            1
      )
    })

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <table> in <div>."`
      )
    } else {
      // FIXME: should show "Expected server HTML to contain a matching <table> in <div>." first
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )
    }

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Page>
       >   <table>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       +                 <table>
       -                 test
                     ...
                 ..."
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
    const { session, browser } = sandbox

    // in the new overlay, `assertHasRedbox` is redundant with `hasErrorToast`
    if (!isNewDevOverlay) {
      await expect(session.hasErrorToast()).resolves.toBe(false)
    }

    await session.assertHasRedbox()

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <table> in <div>."`
      )

      const pseudoHtml = await session.getRedboxComponentStack()
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Page>
       >   <table>"
      `)

      expect(await getRedboxTotalErrorCount(browser)).toBe(3)
    } else {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )

      const pseudoHtml = await session.getRedboxComponentStack()
      if (isTurbopack) {
        expect(pseudoHtml).toMatchInlineSnapshot(`
         "<Root callbacks={[...]}>
             <Head>
             <AppContainer>
               <Container fn={function fn}>
                 <ReactDevOverlay>
                   <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                     <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                       <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                         <Page>
         +                 <table>
         -                 {" 123"}
                       ...
                   ..."
        `)
      } else {
        expect(pseudoHtml).toMatchInlineSnapshot(`
         "<Root callbacks={[...]}>
             <Head>
             <AppContainer>
               <Container fn={function fn}>
                 <ReactDevOverlay>
                   <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                     <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                       <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                         <Page>
         +                 <table>
         -                 {" 123"}
                       ...
                   ..."
        `)
      }
      expect(await getRedboxTotalErrorCount(browser)).toBe(1)
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
    const { session } = sandbox
    await session.assertHasRedbox()
    const pseudoHtml = await session.getRedboxComponentStack()
    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Mismatch>
       >   <div>
             <Suspense>
       >       <main>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "...
           <ReactDevOverlay>
             <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
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
             ..."
      `)
    }

    if (isReact18) {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <main> in <div>."`
      )
    } else {
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:"`
      )
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    const description = await session.getRedboxDescription()
    if (isReact18) {
      expect(description).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <p> in <p>."`
      )
    } else {
      expect(description).toMatchInlineSnapshot(`
        "In HTML, <p> cannot be a descendant of <p>.
        This will cause a hydration error."
      `)
    }

    await session.assertHasRedbox()
    const pseudoHtml = await session.getRedboxComponentStack()

    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Page>
       >   <p>
       >     <p>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       >                 <p>
       >                   <p>
                     ...
                 ..."
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    const description = await session.getRedboxDescription()
    if (isReact18) {
      expect(description).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <div> in <p>."`
      )
    } else {
      expect(description).toMatchInlineSnapshot(`
        "In HTML, <div> cannot be a descendant of <p>.
        This will cause a hydration error."
      `)
    }

    const pseudoHtml = await session.getRedboxComponentStack()

    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Page>
           <div>
             <div>
       >       <p>
       >         <div>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "...
           <Container fn={function fn}>
             <ReactDevOverlay>
               <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                 <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                   <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                     <Page>
                       <div>
                         <div>
       >                   <p>
       >                     <div>
                   ...
               ..."
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    const description = await session.getRedboxDescription()
    if (isReact18) {
      expect(description).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <tr> in <div>."`
      )
    } else {
      expect(description).toMatchInlineSnapshot(`
        "In HTML, <tr> cannot be a child of <div>.
        This will cause a hydration error."
      `)
    }

    const pseudoHtml = await session.getRedboxComponentStack()

    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Page>
       >   <div>
       >     <tr>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
                   <PathnameContextProviderAdapter router={{sdc:{},sbc:{}, ...}} isAutoExport={true}>
                     <App pageProps={{}} Component={function Page} err={undefined} router={{sdc:{},sbc:{}, ...}}>
                       <Page>
       >                 <div>
       >                   <tr>
                     ...
                 ..."
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()
    await retry(async () => {
      expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
    })

    const description = await session.getRedboxDescription()
    if (isReact18) {
      expect(description).toMatchInlineSnapshot(
        `"Expected server HTML to contain a matching <p> in <span>."`
      )
    } else {
      expect(description).toMatchInlineSnapshot(`
        "In HTML, <p> cannot be a descendant of <p>.
        This will cause a hydration error."
      `)
    }

    const pseudoHtml = await session.getRedboxComponentStack()

    if (isReact18) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Page>
           <p>
             <span>
               <span>
                 <span>
       >           <span>
       >             <p>"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
       "<Root callbacks={[...]}>
           <Head>
           <AppContainer>
             <Container fn={function fn}>
               <ReactDevOverlay>
                 <DevOverlayErrorBoundary onError={function usePagesReactDevOverlay.useCallback[onComponentError]}>
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
                 ..."
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
