/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference

describe('Error overlay for hydration errors', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
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

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Error: Text content does not match server-rendered HTML.

      Warning: Text content did not match. Server: "server" Client: "client"

      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
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

    expect(await session.hasRedbox()).toBe(false)

    expect(await browser.elementByCss('.child').text()).toBe('Value')

    await cleanup()
  })

  it('should show correct hydration error when client renders an extra element', async () => {
    const { cleanup, session } = await sandbox(
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

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Expected server HTML to contain a matching <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

    await cleanup()
  })
  it('should show correct hydration error when client renders an extra text node', async () => {
    const { cleanup, session } = await sandbox(
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

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Error: Hydration failed because the initial UI does not match what was rendered on the server.

      Warning: Expected server HTML to contain a matching text node for "second" in <div>.

      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    await cleanup()
  })

  it('should show correct hydration error when server renders an extra element', async () => {
    const { cleanup, session } = await sandbox(
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

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Did not expect server HTML to contain a <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

    await cleanup()
  })

  it('should show correct hydration error when server renders an extra text node', async () => {
    const { cleanup, session } = await sandbox(
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

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Error: Hydration failed because the initial UI does not match what was rendered on the server.

      Warning: Did not expect server HTML to contain the text node "only" in <div>.

      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

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

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Expected server HTML to contain a matching <main> in <div>.

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
})
