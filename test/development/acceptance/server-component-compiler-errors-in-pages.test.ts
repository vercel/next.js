/* eslint-env jest */
import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { sandbox } from './helpers'

const initialFiles = new Map([
  ['next.config.js', 'module.exports = { experimental: { appDir: true } }'],
  ['app/_.js', ''], // app dir need to exists, otherwise the SWC RSC checks will not run
  [
    'pages/index.js',
    `import Comp from '../components/Comp'

        export default function Page() { return <Comp /> }`,
  ],
  [
    'components/Comp.js',
    `export default function Comp() { return <p>Hello world</p> }`,
  ],
])

createNextDescribe(
  'Error Overlay for server components compiler errors in pages',
  {
    files: {},
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    test("importing 'next/headers' in pages", async () => {
      const { session, cleanup } = await sandbox(next, initialFiles, false)

      await session.patch(
        'components/Comp.js',
        `
        import { cookies } from 'next/headers'
  
        export default function Page() {
          return <p>hello world</p>
        }
        `
      )

      expect(await session.hasRedbox(true)).toBe(true)
      await check(
        () => session.getRedboxSource(),
        /That only works in a Server Component/
      )
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./components/Comp.js
        ReactServerComponentsError:

        You're importing a component that needs next/headers. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/getting-started/react-essentials#server-components

           ,-[1:1]
         1 | 
         2 |         import { cookies } from 'next/headers'
           :         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         3 |   
         4 |         export default function Page() {
         5 |           return <p>hello world</p>
           \`----

        Import trace for requested module:
          ./components/Comp.js
          ./pages/index.js"
      `)

      await cleanup()
    })

    test("importing 'server-only' in pages", async () => {
      const { session, cleanup } = await sandbox(next, initialFiles, false)

      await next.patchFile(
        'components/Comp.js',
        `
          import 'server-only' 
    
          export default function Page() {
            return 'hello world'
          }
          `
      )

      expect(await session.hasRedbox(true)).toBe(true)
      await check(
        () => session.getRedboxSource(),
        /That only works in a Server Component/
      )
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./components/Comp.js
        ReactServerComponentsError:

        You're importing a component that needs server-only. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/getting-started/react-essentials#server-components

           ,-[1:1]
         1 | 
         2 |           import 'server-only' 
           :           ^^^^^^^^^^^^^^^^^^^^
         3 |     
         4 |           export default function Page() {
         5 |             return 'hello world'
           \`----

        Import trace for requested module:
          ./components/Comp.js
          ./pages/index.js"
      `)

      await cleanup()
    })
  }
)
