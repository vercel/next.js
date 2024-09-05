/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import path from 'path'

describe('Error overlay for hydration errors (React 18)', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: '18.3.1',
      'react-dom': '18.3.1',
    },
    skipStart: true,
  })

  it('should show correct hydration error when client and server render different text', async () => {
    const { cleanup, session, browser } = await sandbox(
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

    await session.assertHasRedbox()

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
      "Text content does not match server-rendered HTML.
      See more info here: https://nextjs.org/docs/messages/react-hydration-error"
    `)

    expect(await session.getRedboxDescriptionWarning()).toMatchInlineSnapshot(
      `"Text content did not match. Server: "server" Client: "client""`
    )

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

    await cleanup()
  })
})
