/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import path from 'path'

describe('Error overlay for hydration errors', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: '19.0.0-beta-4508873393-20240430',
      'react-dom': '19.0.0-beta-4508873393-20240430',
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

    expect(await session.hasRedbox()).toBe(true)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Text content did not match. Server: "server" Client: "client""`
    )

    expect(await session.getRedboxDescriptionWarning()).toMatchInlineSnapshot(
      `undefined`
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

    expect(await session.hasRedbox()).toBe(false)

    expect(await browser.elementByCss('.child').text()).toBe('Value')

    await cleanup()
  })
})
