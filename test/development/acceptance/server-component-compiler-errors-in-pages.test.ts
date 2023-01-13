/* eslint-env jest */
import { createNextDescribe } from 'e2e-utils'
import { check, getRedboxSource, hasRedbox } from 'next-test-utils'
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
      await check(
        () => getRedboxSource(browser),
        /That only works in a Server Component/
      )
      expect(await getRedboxSource(browser)).toInclude(
        "You're importing a component that needs next/headers. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components"
      )
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
      await check(
        () => getRedboxSource(browser),
        /That only works in a Server Component/
      )
      expect(await getRedboxSource(browser)).toInclude(
        "You're importing a component that needs server-only. That only works in a Server Component which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components"
      )
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
      await check(
        () => getRedboxSource(browser),
        /which is not supported in the pages/
      )
      expect(await getRedboxSource(browser)).toInclude(
        'You have tried to use the "use client" directive which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components'
      )
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
      await check(
        () => getRedboxSource(browser),
        /which is not supported in the pages/
      )
      expect(await getRedboxSource(browser)).toInclude(
        'You have tried to use the "use client" directive which is not supported in the pages/ directory. Read more: https://beta.nextjs.org/docs/rendering/server-and-client-components'
      )
    })
  }
)
