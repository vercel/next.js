/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js
createNextDescribe(
  'Error overlay for hydration errors',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    it('should show correct hydration error when client and server render different text', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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

        Warning: Text content did not match. Server: \\"server\\" Client: \\"client\\"

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    // TODO-APP: Decide if these logs should be displayed somewhere. They don't throw, just logs.
    it.skip('should show correct hydration error when client and server render different html', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return (
        <div className="parent">
          <main
            className="child"
            dangerouslySetInnerHTML={{
              __html: isClient
                ? "<span>client</span>"
                : "<span>server</span>",
            }}
          />
        </div>
      );
    }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    // TODO-APP: Decide if these logs should be displayed somewhere. They don't throw, just logs.
    it.skip('should show correct hydration error when client and server render different attributes', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return (
        <div className="parent">
          <main
            className={isClient ? "child client" : "child server"}
            dir={isClient ? "ltr" : "rtl"}
          />
        </div>
      );
    }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    // TODO-APP: Decide if these logs should be displayed somewhere. They don't throw, just logs.
    it.skip('should show correct hydration error when client renders extra attributes', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return (
        <div className="parent">
          <main
            className="child"
            tabIndex={isClient ? 1 : null}
            dir={isClient ? "ltr" : null}
          />
        </div>
      );
    }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    // TODO-APP: Decide if these logs should be displayed somewhere. They don't throw, just logs.
    it.skip('should show correct hydration error when server renders extra attributes', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return (
        <div className="parent">
          <main
            className="child"
            tabIndex={isClient ? null : 1}
            dir={isClient ? null : "rtl"}
          />
        </div>
      );
    }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    // TODO-APP: Decide if these logs should be displayed somewhere. They don't throw, just logs.
    it.skip('should show correct hydration error when both client and server render extra attributes', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return (
        <div className="parent">
          <main
            className="child"
            tabIndex={isClient ? 1 : null}
            dir={isClient ? null : "rtl"}
          />
        </div>
      );
    }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    // TODO-APP: Decide if these logs should be displayed somewhere. They don't throw, just logs.
    it.skip('should show correct hydration error when client and server render different styles', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return (
        <div className="parent">
          <main
            className="child"
            style={{
              opacity: isClient ? 1 : 0,
            }}
          />
        </div>
      );
    }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra element as only child', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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
    it('should show correct hydration error when client renders an extra element in the beginning', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {isClient && <header className="1" />}
            <main className="2" />
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

        Warning: Expected server HTML to contain a matching <header> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra element in the middle', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            {isClient && <main className="2" />}
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

        Warning: Expected server HTML to contain a matching <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra element in the end', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            <main className="2" />
            {isClient && <footer className="3" />}
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

        Warning: Expected server HTML to contain a matching <footer> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra text node as only child', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return <div className="parent">{isClient && "only"}</div>;
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Text content does not match server-rendered HTML.

        Warning: Text content did not match. Server: \\"\\" Client: \\"only\\"

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra text node in the beginning 1', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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

        Warning: Expected server HTML to contain a matching text node for \\"second\\" in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra text node in the beginning 2', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {isClient && "first"}
            <main className="2" />
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

        Warning: Expected server HTML to contain a matching text node for \\"first\\" in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra text node in the end', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            <main className="2" />
            {isClient && "third"}
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

        Warning: Expected server HTML to contain a matching text node for \\"third\\" in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra element as only child', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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
    it('should show correct hydration error when server renders an extra element in the beginning', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {!isClient && <header className="1" />}
            <main className="2" />
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

        Warning: Expected server HTML to contain a matching <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra element in the middle', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            {!isClient && <main className="2" />}
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

        Warning: Expected server HTML to contain a matching <footer> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra element in the end', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            <main className="2" />
            {!isClient && <footer className="3" />}
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

        Warning: Did not expect server HTML to contain a <footer> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra text node as only child', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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

        Warning: Did not expect server HTML to contain the text node \\"only\\" in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra text node in the beginning', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {!isClient && "first"}
            <main className="2" />
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

        Warning: Expected server HTML to contain a matching <main> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra text node in the middle', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            {!isClient && "second"}
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

        Warning: Expected server HTML to contain a matching <footer> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra text node in the end', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <header className="1" />
            <main className="2" />
            {!isClient && "third"}
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

        Warning: Did not expect server HTML to contain the text node \\"third\\" in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it.skip('should show correct hydration error when client renders an extra Suspense node in content mode', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  import React from "react"
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {isClient && (
              <React.Suspense fallback={<p>Loading...</p>}>
                <main className="only" />
              </React.Suspense>
            )}
          </div>
        );
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra Suspense node in content mode', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  import React from "react"
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {!isClient && (
              <React.Suspense fallback={<p>Loading...</p>}>
                <main className="only" />
              </React.Suspense>
            )}
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
    it.skip('should show correct hydration error when client renders an extra Suspense node in fallback mode', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  import React from "react"
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {isClient && (
              <React.Suspense fallback={<p>Loading...</p>}>
                <main className="only" />
                <Never />
              </React.Suspense>
            )}
          </div>
        );
      }
      function Never() {
        throw new Promise((resolve) => {})
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    it.skip('should show correct hydration error when server renders an extra Suspense node in fallback mode', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  import React from "react"
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {!isClient && (
              <React.Suspense fallback={<p>Loading...</p>}>
                <main className="only" />
                <Never />
              </React.Suspense>
            )}
          </div>
        );
      }
      function Never() {
        throw new Promise((resolve) => {})
      }
`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra node inside Suspense content', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
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
    it('should show correct hydration error when server renders an extra node inside Suspense content', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  import React from "react"
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <React.Suspense fallback={<p>Loading...</p>}>
              <header className="1" />
              {!isClient && <main className="second" />}
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

        Warning: Expected server HTML to contain a matching <footer> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it.skip('should show correct hydration error when client renders an extra node inside Suspense fallback', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  import React from "react"
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <React.Suspense
              fallback={
                <>
                  <p>Loading...</p>
                  {isClient && <br />}
                </>
              }
            >
              <main className="only" />
            </React.Suspense>
          </div>
        );
      }

`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    it.skip('should show correct hydration error when server renders an extra node inside Suspense fallback', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            <React.Suspense
              fallback={
                <>
                  <p>Loading...</p>
                  {!isClient && <br />}
                </>
              }
            >
              <main className="only" />
              <Never />
            </React.Suspense>
          </div>
        );
      }

`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra Fragment node', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {isClient && (
              <>
                <header className="1" />
                <main className="2" />
                <footer className="3" />
              </>
            )}
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

        Warning: Expected server HTML to contain a matching <header> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra Fragment node', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
        return (
          <div className="parent">
            {!isClient && (
              <>
                <header className="1" />
                <main className="2" />
                <footer className="3" />
              </>
            )}
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

        Warning: Did not expect server HTML to contain a <header> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when client renders an extra node deeper in the tree', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return isClient ? <ProfileSettings /> : <MediaSettings />;
    }

    function ProfileSettings() {
      return (
        <div className="parent">
          <input />
          <Panel type="profile" />
        </div>
      );
    }

    function MediaSettings() {
      return (
        <div className="parent">
          <input />
          <Panel type="media" />
        </div>
      );
    }

    function Panel({ type }) {
      return (
        <>
          <header className="1" />
          <main className="2" />
          {type === "profile" && <footer className="3" />}
        </>
      );
    }

`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Expected server HTML to contain a matching <footer> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
    it('should show correct hydration error when server renders an extra node deeper in the tree', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `
  'use client'
  const isClient = typeof window !== 'undefined'
  export default function Mismatch() {
      return isClient ? <ProfileSettings /> : <MediaSettings />;
    }

    function ProfileSettings() {
      return (
        <div className="parent">
          <input />
          <Panel type="profile" />
        </div>
      );
    }

    function MediaSettings() {
      return (
        <div className="parent">
          <input />
          <Panel type="media" />
        </div>
      );
    }

    function Panel({ type }) {
      return (
        <>
          <header className="1" />
          <main className="2" />
          {type !== "profile" && <footer className="3" />}
        </>
      );
    }

`,
          ],
        ])
      )

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Hydration failed because the initial UI does not match what was rendered on the server.

        Warning: Did not expect server HTML to contain a <footer> in <div>.

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

      await cleanup()
    })
  }
)
