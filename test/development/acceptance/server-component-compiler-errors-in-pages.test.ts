/* eslint-env jest */
import { createNextDescribe } from 'e2e-utils'
import { getRedboxSource, hasRedbox } from 'next-test-utils'
import webdriver from 'next-webdriver'

createNextDescribe(
  'Error Overlay for server components compiler errors in pages',
  {
    files: {
      'app/test.js': '',
      'pages/index.js': `import Comp from '../components/Comp'
        
        export default function Page() { return <Comp /> }`,
      'components/Comp.js': `export default function Comp() { return <p>Hello world</p> }`,
    },
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    nextConfig: {
      experimental: {
        appDir: true,
      },
    },
  },
  ({ next }) => {
    test("importing 'next/headers' in pages", async () => {
      const browser = await webdriver(next.url, '/')

      await next.patchFile(
        'components/Comp.js',
        `
        import { cookies } from 'next/headers'
  
        export default function Page() {
          return 'hello world'
        }
        `
      )

      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "./components/Comp.js

        You're importing a component that needs next/headers. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components

           ,-[1:1]
         1 | 
         2 |         import { cookies } from 'next/headers'
           :         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         3 |   
         4 |         export default function Page() {
         5 |           return 'hello world'
           \`----

        Import trace for requested module:
          components/Comp.js
          pages/index.js"
      `)
    })

    test("importing 'server-only' in pages", async () => {
      const browser = await webdriver(next.url, '/')

      await next.patchFile(
        'components/Comp.js',
        `
          import 'server-only' 
    
          export default function Page() {
            return 'hello world'
          }
          `
      )

      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "./components/Comp.js

        You're importing a component that needs server-only. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components

           ,-[1:1]
         1 | 
         2 |           import 'server-only' 
           :           ^^^^^^^^^^^^^^^^^^^^
         3 |     
         4 |           export default function Page() {
         5 |             return 'hello world'
           \`----

        Import trace for requested module:
          components/Comp.js
          pages/index.js"
      `)
    })

    test('"use client" at the bottom of the page', async () => {
      const browser = await webdriver(next.url, '/')

      await next.patchFile(
        'components/Comp.js',
        `
        export default function Component() {
            return null
        }
        'use client';
          `
      )

      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "./components/Comp.js

        You have tried to use the \\"use client\\" directive which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components

           ,-[2:1]
         2 |         export default function Component() {
         3 |             return null
         4 |         }
         5 |         'use client';
           :         ^^^^^^^^^^^^^
         6 |           
           \`----

        Import trace for requested module:
          components/Comp.js
          pages/index.js"
      `)
    })

    test('"use client" with parentheses', async () => {
      const browser = await webdriver(next.url, '/')

      await next.patchFile(
        'components/Comp.js',
        `
          ;('use client')
          export default function Component() {
              return null
          }
            `
      )

      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "./components/Comp.js

        You have tried to use the \\"use client\\" directive which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components

           ,-[1:1]
         1 | 
         2 |           ;('use client')
           :            ^^^^^^^^^^^^^^
         3 |           export default function Component() {
         4 |               return null
         5 |           }
           \`----

        Import trace for requested module:
          components/Comp.js
          pages/index.js"
      `)
    })
  }
)
