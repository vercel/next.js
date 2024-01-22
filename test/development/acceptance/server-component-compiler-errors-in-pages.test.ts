/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { sandbox } from 'development-sandbox'
import { outdent } from 'outdent'

const initialFiles = new Map([
  ['app/_.js', ''], // app dir need to exists, otherwise the SWC RSC checks will not run
  [
    'pages/index.js',
    outdent`
      import Comp from '../components/Comp'

      export default function Page() { return <Comp /> }
    `,
  ],
  [
    'components/Comp.js',
    outdent`
      export default function Comp() {
        return <p>Hello world</p>
      }
    `,
  ],
])

describe('Error Overlay for server components compiler errors in pages', () => {
  const { next } = nextTestSetup({
    files: {},
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  })

  test("importing 'next/headers' in pages", async () => {
    const { session, cleanup } = await sandbox(next, initialFiles)

    await session.patch(
      'components/Comp.js',
      outdent`
        import { cookies } from 'next/headers'

        export default function Page() {
          return <p>hello world</p>
        }
      `
    )

    expect(await session.hasRedbox()).toBe(true)
    await check(
      () => session.getRedboxSource(),
      /That only works in a Server Component/
    )

    expect(next.normalizeTestDirContent(await session.getRedboxSource()))
      .toMatchInlineSnapshot(`
      "./components/Comp.js
      Error: 
        x You're importing a component that needs next/headers. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/getting-started/
        | react-essentials#server-components
        | 
        | 
         ,-[TEST_DIR/components/Comp.js:1:1]
       1 | import { cookies } from 'next/headers'
         : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       2 | 
       3 | export default function Page() {
       4 |   return <p>hello world</p>
         \`----

      Import trace for requested module:
      ./components/Comp.js
      ./pages/index.js"
    `)

    await cleanup()
  })

  test("importing 'server-only' in pages", async () => {
    const { session, cleanup } = await sandbox(next, initialFiles)

    await next.patchFile(
      'components/Comp.js',
      outdent`
        import 'server-only'

        export default function Page() {
          return 'hello world'
        }
      `
    )

    expect(await session.hasRedbox()).toBe(true)
    await check(
      () => session.getRedboxSource(),
      /That only works in a Server Component/
    )

    expect(next.normalizeTestDirContent(await session.getRedboxSource()))
      .toMatchInlineSnapshot(`
      "./components/Comp.js
      Error: 
        x You're importing a component that needs server-only. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/getting-started/
        | react-essentials#server-components
        | 
        | 
         ,-[TEST_DIR/components/Comp.js:1:1]
       1 | import 'server-only'
         : ^^^^^^^^^^^^^^^^^^^^
       2 | 
       3 | export default function Page() {
       4 |   return 'hello world'
         \`----

      Import trace for requested module:
      ./components/Comp.js
      ./pages/index.js"
    `)

    await cleanup()
  })
})
