/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'Component Stack in error overlay',
  {
    files: {},
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    it('should show a component stack on hydration error', async () => {
      const { cleanup, session } = await sandbox(
        next,
        new Map([
          [
            'component.js',
            `
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
            `
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
  }
)
