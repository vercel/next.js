/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { check } from 'next-test-utils'
import { outdent } from 'outdent'

describe('Error Overlay for server components', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  })

  describe('createContext called in Server Component', () => {
    it('should show error when React.createContext is called', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            outdent`
              import React from 'react'
              const Context = React.createContext()
              export default function Page() {
                return (
                  <>
                      <Context.Provider value="hello">
                          <h1>Page</h1>
                      </Context.Provider>
                  </>
                )
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
      )

      await cleanup()
    })

    it('should show error when React.createContext is called in external package', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            outdent`
              const React = require('react')
              module.exports = React.createContext()
            `,
          ],
          [
            'node_modules/my-package/package.json',
            outdent`
              {
                "name": "my-package",
                "version": "0.0.1"
              }
            `,
          ],
          [
            'app/page.js',
            outdent`
              import Context from 'my-package'
              export default function Page() {
                return (
                  <>
                      <Context.Provider value="hello">
                          <h1>Page</h1>
                      </Context.Provider>
                  </>
                )
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
      )

      await cleanup()
    })

    it('should show error when createContext is called in external package', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            outdent`
              const { createContext } = require('react')
              module.exports = createContext()
            `,
          ],
          [
            'node_modules/my-package/package.json',
            outdent`
              {
                "name": "my-package",
                "version": "0.0.1"
              }
            `,
          ],
          [
            'app/page.js',
            outdent`
              import Context from 'my-package'
              export default function Page() {
                return (
                  <>
                      <Context.Provider value="hello">
                          <h1>Page</h1>
                      </Context.Provider>
                  </>
                )
              }
            `,
          ],
        ])
      )
      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'createContext only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/context-in-server-component'
      )

      await cleanup()
    })
  })

  describe('React component hooks called in Server Component', () => {
    it('should show error when React.<client-hook> is called', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            outdent`
              import React from 'react'
              export default function Page() {
                const ref = React.useRef()
                return "Hello world"
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'useRef only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'useRef only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
      )

      await cleanup()
    })

    it('should show error when React.experiment_useOptimistic is called', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            outdent`
              import React from 'react'
              export default function Page() {
                const optimistic = React.experimental_useOptimistic()
                return "Hello world"
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'experimental_useOptimistic only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'experimental_useOptimistic only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
      )

      await cleanup()
    })

    it('should show error when React.experiment_useOptimistic is renamed in destructuring', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            outdent`
              import { experimental_useOptimistic as useOptimistic } from 'react'
              export default function Page() {
                const optimistic = useOptimistic()
                return "Hello world"
              }
            `,
          ],
        ])
      )

      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('experimental_useOptimistic')
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain('experimental_useOptimistic')

      await cleanup()
    })

    it('should show error when React.<client-hook> is called in external package', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            outdent`
              const React = require('react')
              module.exports = function Component() {
                const [state, useState] = React.useState()
                return "Hello world"
              }
            `,
          ],
          [
            'node_modules/my-package/package.json',
            outdent`
              {
                "name": "my-package",
                "version": "0.0.1"
              }
            `,
          ],
          [
            'app/page.js',
            outdent`
              import Component from 'my-package'
              export default function Page() {
                return <Component />
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
      )

      await cleanup()
    })

    it('should show error when React client hook is called in external package', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            outdent`
              const { useEffect } = require('react')
              module.exports = function Component() {
                useEffect(() => {}, [])
                return "Hello world"
              }
            `,
          ],
          [
            'node_modules/my-package/package.json',
            outdent`
              {
                "name": "my-package",
                "version": "0.0.1"
              }
            `,
          ],
          [
            'app/page.js',
            outdent`
              import Component from 'my-package'
              export default function Page() {
                return <Component />
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'useEffect only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'useEffect only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component'
      )

      await cleanup()
    })
  })

  describe('Class component used in Server Component', () => {
    it('should show error when Class Component is used', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            outdent`
              import React from 'react'
              export default class Page extends React.Component {
                render() {
                  return <p>Hello world</p>
                }
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'This might be caused by a React Class Component being rendered in a Server Component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'This might be caused by a React Class Component being rendered in a Server Component'
      )

      await cleanup()
    })

    it('should show error when React.PureComponent is rendered in external package', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            outdent`
              const React = require('react')
              module.exports = class extends React.PureComponent {
                render() {
                  return "Hello world"
                }
              }
            `,
          ],
          [
            'node_modules/my-package/package.json',
            outdent`
              {
                "name": "my-package",
                "version": "0.0.1"
              }
            `,
          ],
          [
            'app/page.js',
            outdent`
              import Component from 'my-package'
              export default function Page() {
                return <Component />
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'This might be caused by a React Class Component being rendered in a Server Component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'This might be caused by a React Class Component being rendered in a Server Component'
      )

      await cleanup()
    })

    it('should show error when Component is rendered in external package', async () => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            outdent`
              const { Component } = require('react')
              module.exports = class extends Component {
                render() {
                  return "Hello world"
                }
              }
            `,
          ],
          [
            'node_modules/my-package/package.json',
            outdent`
              {
                "name": "my-package",
                "version": "0.0.1"
              }
            `,
          ],
          [
            'app/page.js',
            outdent`
              import Component from 'my-package'
              export default function Page() {
                return <Component />
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          'This might be caused by a React Class Component being rendered in a Server Component'
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        'This might be caused by a React Class Component being rendered in a Server Component'
      )

      await cleanup()
    })
  })

  describe('Next.js component hooks called in Server Component', () => {
    it.each([
      // TODO-APP: add test for useParams
      // ["useParams"],
      ['useRouter'],
      ['useSearchParams'],
      ['useSelectedLayoutSegment'],
      ['useSelectedLayoutSegments'],
      ['usePathname'],
    ])('should show error when %s is called', async (hook: string) => {
      const { browser, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            outdent`
              import { ${hook} } from 'next/navigation'
              export default function Page() {
                ${hook}()
                return "Hello world"
              }
            `,
          ],
        ])
      )

      await check(async () => {
        expect(
          await browser
            .waitForElementByCss('#nextjs__container_errors_desc')
            .text()
        ).toContain(
          `Error: ${hook} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
        )
        return 'success'
      }, 'success')

      expect(next.cliOutput).toContain(
        `Error: ${hook} only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
      )

      await cleanup()
    })
  })
})
