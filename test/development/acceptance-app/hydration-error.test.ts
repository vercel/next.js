/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import { getRedboxTotalErrorCount } from 'next-test-utils'

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference

describe('Error overlay for hydration errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should show correct hydration error when client and server render different text', async () => {
    const { cleanup, session, browser } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used
      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    expect(await session.getRedboxDescriptionWarning()).toMatchInlineSnapshot(`
      "- A server/client branch \`if (typeof window !== 'undefined')\`.
      - Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
      - Date formatting in a user's locale which doesn't match the server.
      - External changing data without sending a snapshot of it along with the HTML.
      - Invalid HTML tag nesting.

      It can also happen if the client has a browser extension installed which messes with the HTML before React loaded."
    `)

    const pseudoHtml = await session.getRedboxComponentStack()

    if (isTurbopack) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          ...
        +  client
        -  server"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          <div className="parent">
            <main className="child">
        +      client
        -      server"
      `)
    }

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

    await cleanup()
  })

  it('should show correct hydration error when client renders an extra element', async () => {
    const { browser, cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          ...
        +  <main className="only">"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          <div className="parent">
        +    <main className="only">"
      `)
    }

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used
      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    await cleanup()
  })

  it('should show correct hydration error when client renders an extra text node', async () => {
    const { browser, cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(pseudoHtml).toEqual(outdent`
        ...
          ...
            ...
        +  second
        -  <footer className="3">
      `)
    } else {
      expect(pseudoHtml).toEqual(outdent`
        ...
          <div className="parent">
        +    second
        -    <footer className="3">
      `)
    }

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used
      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    await cleanup()
  })

  it('should show correct hydration error when server renders an extra element', async () => {
    const { browser, cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(pseudoHtml).toEqual(outdent`
        ...
          ...
        -  <main className="only">
      `)
    } else {
      expect(pseudoHtml).toEqual(outdent`
        ...
          <div className="parent">
        -    <main className="only">
      `)
    }

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used
      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    await cleanup()
  })

  it('should show correct hydration error when server renders an extra text node', async () => {
    const { browser, cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used
      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    const pseudoHtml = await session.getRedboxComponentStack()

    if (isTurbopack) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          ...
        -  only"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          <div className="parent">
        -    only"
      `)
    }

    await cleanup()
  })

  it('should show correct hydration error when server renders an extra text node in an invalid place', async () => {
    const { browser, cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    // FIXME: Should be 2
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    // FIXME: Should also have "text nodes cannot be a child of tr"
    expect(await session.getRedboxDescription()).toEqual(outdent`
      Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used
      See more info here: https://nextjs.org/docs/messages/react-hydration-error
    `)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(pseudoHtml).toEqual(outdent`
        ...
          ...
        +  <table>
        -  test
      `)
    } else {
      expect(pseudoHtml).toEqual(outdent`
        ...
        +  <table>
        -  test
    }`)
    }

    await cleanup()
  })

  it('should show correct hydration error when server renders an extra whitespace in an invalid place', async () => {
    const { cleanup, session } = await sandbox(
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

    // FIXME: Should have getRedboxDescription() "text nodes cannot be a child of tr"
    await expect(session.hasErrorToast()).resolves.toBe(false)

    // await session.waitForAndOpenRuntimeError()

    // expect(await session.hasRedbox()).toBe(false)
    // expect(await getRedboxTotalErrorCount(browser)).toBe(0)

    // expect(await session.getRedboxDescription()).toEqual(outdent`
    //   Something
    // `)

    // const pseudoHtml = await session.getRedboxComponentStack()
    // expect(pseudoHtml).toEqual(outdent`
    //   Something
    // `)

    await cleanup()
  })

  it('should show correct hydration error when client renders an extra node inside Suspense content', async () => {
    const { cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(pseudoHtml).toEqual(outdent`
      ...
        ...
          ...
      +  <main className="second">
      -  <footer className="3">
    `)
    } else {
      expect(pseudoHtml).toEqual(outdent`
      ...
        <div className="parent">
          <Suspense fallback={<p>}>
            ...
      +      <main className="second">
      -      <footer className="3">
    `)
    }

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used
      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    await cleanup()
  })

  it('should not show a hydration error when using `useId` in a client component', async () => {
    const { cleanup, browser } = await sandbox(
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

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    expect(errors).not.toInclude(
      'Warning: Prop `%s` did not match. Server: %s Client: %s'
    )

    await cleanup()
  })

  it('should only show one hydration error when bad nesting happened - p under p', async () => {
    const { cleanup, session, browser } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const description = await session.getRedboxDescription()
    expect(description).toContain(
      'In HTML, <p> cannot be a descendant of <p>.\nThis will cause a hydration error.'
    )

    const pseudoHtml = await session.getRedboxComponentStack()

    // Turbopack currently has longer component stack trace
    if (isTurbopack) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          <Page>
            <p>
            ^^^
              <p>
              ^^^"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "<Page>
          <p>
          ^^^
            <p>
            ^^^"
      `)
    }

    await cleanup()
  })

  it('should only show one hydration error when bad nesting happened - div under p', async () => {
    const { cleanup, session, browser } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const description = await session.getRedboxDescription()
    expect(description).toContain(
      'In HTML, <div> cannot be a descendant of <p>.\nThis will cause a hydration error.'
    )

    const pseudoHtml = await session.getRedboxComponentStack()

    expect(pseudoHtml).toMatchInlineSnapshot(`
      "...
        <div>
          <p>
          ^^^
            <div>
            ^^^^^"
    `)

    await cleanup()
  })

  it('should only show one hydration error when bad nesting happened - div > tr', async () => {
    const { cleanup, session, browser } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const description = await session.getRedboxDescription()
    expect(description).toEqual(outdent`
      In HTML, <tr> cannot be a child of <div>.
      This will cause a hydration error.
    `)

    const pseudoHtml = await session.getRedboxComponentStack()

    // Turbopack currently has longer component stack trace
    if (isTurbopack) {
      expect(pseudoHtml).toEqual(outdent`
        ...
          <Page>
            <div>
            ^^^^^
              <tr>
              ^^^^
      `)
    } else {
      expect(pseudoHtml).toEqual(outdent`
        <Page>
          <div>
          ^^^^^
            <tr>
            ^^^^
      `)
    }

    await cleanup()
  })

  it('should show the highlighted bad nesting html snippet when bad nesting happened', async () => {
    const { browser, cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const description = await session.getRedboxDescription()
    expect(description).toContain(
      'In HTML, <p> cannot be a descendant of <p>.\nThis will cause a hydration error.'
    )

    const pseudoHtml = await session.getRedboxComponentStack()

    // Turbopack currently has longer component stack trace
    if (isTurbopack) {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          <Page>
            <p>
            ^^^
              <span>
                ...
                  <span>
                    <p>
                    ^^^"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "<Page>
          <p>
          ^^^
            <span>
              ...
                <span>
                  <p>
                  ^^^"
      `)
    }

    await cleanup()
  })

  it('should show error if script is directly placed under html instead of body', async () => {
    const { browser, cleanup, session } = await sandbox(
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

    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const description = await session.getRedboxDescription()
    expect(description).toEqual(outdent`
      In HTML, <script> cannot be a child of <html>.
      This will cause a hydration error.
    `)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(pseudoHtml).toEqual(outdent`
        ...
          <Layout>
            <html>
            ^^^^^^
              <Script>
                <script>
                ^^^^^^^^
      `)
    } else {
      expect(pseudoHtml).toEqual(outdent`
        <script>
        ^^^^^^^^
      `)
    }
    await cleanup()
  })

  it('should collapse and uncollapse properly when there are many frames', async () => {
    const { browser, cleanup, session } = await sandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'

            const isServer = typeof window === 'undefined'
            
            function Mismatch() {
              return (
                <p>
                  <span>
                    
                    hello {isServer ? 'server' : 'client'}
                  </span>
                </p>
              )
            }
            
            export default function Page() {
              return (
                <div>
                  <div>
                    <div>
                      <div>
                        <Mismatch />
                      </div>
                    </div>
                  </div>
                </div>
              )
            }
          `,
        ],
      ])
    )
    await session.waitForAndOpenRuntimeError()

    await session.assertHasRedbox()
    expect(await getRedboxTotalErrorCount(browser)).toBe(1)

    const pseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      // FIXME: Should not fork on Turbopack i.e. match the snapshot in the else-branch
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          ...
        +  client
        -  server"
      `)
    } else {
      expect(pseudoHtml).toMatchInlineSnapshot(`
        "...
          <div>
            <div>
              <div>
                <div>
                  <Mismatch>
                    <p>
                      <span>
        +                client
        -                server"
      `)
    }

    await session.toggleCollapseComponentStack()

    const fullPseudoHtml = await session.getRedboxComponentStack()
    if (isTurbopack) {
      expect(fullPseudoHtml).toMatchInlineSnapshot(`
        "...
          <NotFoundErrorBoundary pathname="/" notFound={[...]} notFoundStyles={[...]} asNotFound={undefined} missingSlots={Set}>
            <RedirectBoundary>
              <RedirectErrorBoundary router={{...}}>
                <InnerLayoutRouter parallelRouterKey="children" url="/" tree={[...]} childNodes={Map} segmentPath={[...]} ...>
                  <ClientPageRoot props={{params:{}, ...}} Component={function Page}>
                    <Page params={{}} searchParams={{}}>
                      <div>
                        <div>
                          <div>
                            <div>
                              <Mismatch>
                                <p>
                                  <span>
                                    ...
        +                            client
        -                            server"
      `)
    } else {
      expect(fullPseudoHtml).toMatchInlineSnapshot(`
        "...
          <NotFoundErrorBoundary pathname="/" notFound={[...]} notFoundStyles={[...]} asNotFound={undefined} missingSlots={Set}>
            <RedirectBoundary>
              <RedirectErrorBoundary router={{...}}>
                <InnerLayoutRouter parallelRouterKey="children" url="/" tree={[...]} childNodes={Map} segmentPath={[...]} ...>
                  <ClientPageRoot props={{params:{}, ...}} Component={function Page}>
                    <Page params={{}} searchParams={{}}>
                      <div>
                        <div>
                          <div>
                            <div>
                              <Mismatch>
                                <p>
                                  <span>
        +                            client
        -                            server"
      `)
    }

    await cleanup()
  })
})
