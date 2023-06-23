/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import path from 'path'

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
    const { cleanup, session } = await sandbox(
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

    expect(await session.hasRedbox(true)).toBe(true)

    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Text content does not match server-rendered HTML.

        Warning: Text content did not match. Server: \\"server\\" Client: \\"client\\"

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

    await cleanup()
  })
})
