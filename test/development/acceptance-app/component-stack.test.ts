/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'Component Stack in error overlay',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
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
            'app/component.js',
            `
  'use client'
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
            'app/page.js',
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

      await session.waitForAndOpenRuntimeError()

      expect(await session.getRedboxComponentStack()).toMatchInlineSnapshot(`
        "p
        div
        Component
        main"
      `)

      await cleanup()
    })
  }
)
