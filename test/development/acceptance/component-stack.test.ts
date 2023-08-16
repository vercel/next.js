/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import path from 'path'

describe('Component Stack in error overlay', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  })

  it('should show a component stack on hydration error', async () => {
    const { cleanup, session } = await sandbox(
      next,
      new Map([
        [
          'component.js',
          outdent`
            const isClient = typeof window !== 'undefined'
            export default function Component() {
                return (
                  <div>
                    <p>{isClient ? "client" : "server"}</p>
                  </div>
                );
              }
          `,
        ],
        [
          'index.js',
          outdent`
            import Component from './component'
            export default function Mismatch() {
                return (
                  <main>
                    <Component />
                  </main>
                );
              }
          `,
        ],
      ])
    )

    expect(await session.hasRedbox(true)).toBe(true)

    expect(await session.getRedboxComponentStack()).toMatchInlineSnapshot(`
        "p
        div
        Component
        main
        Mismatch"
      `)

    await cleanup()
  })
})
