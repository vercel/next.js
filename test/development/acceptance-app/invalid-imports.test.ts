/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

describe('Error Overlay invalid imports', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      'server-only': 'latest',
      'client-only': 'latest',
    },
    skipStart: true,
  })

  it('should show error when using styled-jsx in server component', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'app/comp1.js',
          outdent`
            import { Comp2 } from './comp2'

            export function Comp1() {
              return <Comp2 />
            }
          `,
        ],
        [
          'app/comp2.js',
          outdent`
            export function Comp2() {
              return (
                <div>
                  <style jsx>{\`
                    p {
                      color: red;
                    }
                  \`}</style>
                </div>
              )
            }
          `,
        ],
        [
          'app/page.js',
          outdent`
            'use client'
            import { Comp1 } from './comp1'

            export default function Page() {
              return <Comp1 />
            }
          `,
        ],
      ])
    )

    const pageFile = 'app/page.js'
    const content = await next.readFile(pageFile)
    const withoutUseClient = content.replace("'use client'", '')
    await session.patch(pageFile, withoutUseClient)

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "./app/comp2.js
      'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component.

      The error was caused by using 'styled-jsx' in './app/comp2.js'. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.

      Import trace for requested module:
      ./app/comp2.js
      ./app/comp1.js
      ./app/page.js"
    `)

    await cleanup()
  })

  it('should show error when external package imports client-only in server component', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'node_modules/client-only-package/index.js',
          outdent`
            require("client-only")
          `,
        ],
        [
          'node_modules/client-only-package/package.json',
          outdent`
            {
              "name": "client-only-package",
              "main": "index.js"
            }
          `,
        ],
        [
          'app/comp1.js',
          outdent`
            import { Comp2 } from './comp2'

            export function Comp1() {
              return <Comp2 />
            }
          `,
        ],
        [
          'app/comp2.js',
          outdent`
            import "client-only-package"
            export function Comp2() {
              return (
                <div>Hello world</div>
              )
            }
          `,
        ],
        [
          'app/page.js',
          outdent`
            'use client'
            import { Comp1 } from './comp1'

            export default function Page() {
              return <Comp1 />
            }
          `,
        ],
      ])
    )

    const pageFile = 'app/page.js'
    const content = await next.readFile(pageFile)
    const withoutUseClient = content.replace("'use client'", '')
    await session.patch(pageFile, withoutUseClient)

    expect(await session.hasRedbox()).toBe(true)
    if (process.env.TURBOPACK) {
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./node_modules/client-only-package
        Invalid import
        'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component.
        The error was caused by importing 'node_modules/client-only-package'"
      `)
    } else {
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./app/comp2.js
        'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component.

        The error was caused by importing 'client-only-package/index.js' in './app/comp2.js'.

        Import trace for requested module:
        ./app/comp2.js
        ./app/comp1.js
        ./app/page.js"
      `)
    }

    await cleanup()
  })

  it('should show error when external package imports server-only in client component', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'node_modules/server-only-package/index.js',
          outdent`
            require("server-only")
          `,
        ],
        [
          'node_modules/server-only-package/package.json',
          outdent`
            {
              "name": "server-only-package",
              "main": "index.js"
            }
          `,
        ],
        [
          'app/comp1.js',
          outdent`
            import { Comp2 } from './comp2'

            export function Comp1() {
              return <Comp2 />
            }
          `,
        ],
        [
          'app/comp2.js',
          outdent`
            import 'server-only-package'
            export function Comp2() {
              return (
                <div>Hello world</div>
              )
            }
          `,
        ],
        [
          'app/page.js',
          outdent`
            import { Comp1 } from './comp1'

            export default function Page() {
              return <Comp1 />
            }
          `,
        ],
      ])
    )

    const file = 'app/page.js'
    const content = await next.readFile(file)
    await session.patch(file, "'use client'\n" + content)

    expect(await session.hasRedbox()).toBe(true)
    if (process.env.TURBOPACK) {
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./node_modules/server-only-package
        Invalid import
        'server-only' cannot be imported from a Client Component module. It should only be used from a Server Component.
        The error was caused by importing 'node_modules/server-only-package'"
      `)
    } else {
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./app/comp2.js
        'server-only' cannot be imported from a Client Component module. It should only be used from a Server Component.

        The error was caused by importing 'server-only-package/index.js' in './app/comp2.js'.

        Import trace for requested module:
        ./app/comp2.js
        ./app/comp1.js
        ./app/page.js"
      `)
    }

    await cleanup()
  })
})
