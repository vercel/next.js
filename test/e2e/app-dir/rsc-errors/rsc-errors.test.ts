import {
  check,
  getRedboxHeader,
  getRedboxSource,
  hasRedbox,
} from 'next-test-utils'
import { createNextDescribe } from 'e2e-utils'

if (!(globalThis as any).isNextDev) {
  it('should skip tests for next-start', () => {})
} else {
  createNextDescribe(
    'app dir - rsc errors',
    {
      files: __dirname,
      skipDeployment: true,
    },
    ({ next }) => {
      it('should throw an error when getServerSideProps is used', async () => {
        const pageFile = 'app/client-with-errors/get-server-side-props/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace(
          '// export function getServerSideProps',
          'export function getServerSideProps'
        )
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch(
          '/client-with-errors/get-server-side-props'
        )
        await next.patchFile(pageFile, content)

        await check(async () => {
          const { status } = await next.fetch(
            '/client-with-errors/get-server-side-props'
          )
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          '"getServerSideProps\\" is not supported in app/'
        )
      })

      it('should throw an error when getStaticProps is used', async () => {
        const pageFile = 'app/client-with-errors/get-static-props/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace(
          '// export function getStaticProps',
          'export function getStaticProps'
        )
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch('/client-with-errors/get-static-props')
        await next.patchFile(pageFile, content)

        await check(async () => {
          const { status } = await next.fetch(
            '/client-with-errors/get-static-props'
          )
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          '"getStaticProps\\" is not supported in app/'
        )
      })

      it('should error for styled-jsx imports on server side', async () => {
        const html = await next.render('/server-with-errors/styled-jsx')
        expect(html).toContain(
          'This module cannot be imported from a Server Component module. It should only be used from a Client Component.'
        )
      })

      it('should error when page component export is not valid', async () => {
        const html = await next.render('/server-with-errors/page-export')
        expect(html).toContain(
          'The default export is not a React Component in page:'
        )
      })

      it('should throw an error when "use client" is on the top level but after other expressions', async () => {
        const pageFile = 'app/swc/use-client/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace("// 'use client'", "'use client'")
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch('/swc/use-client')
        await next.patchFile(pageFile, content)

        await check(async () => {
          const { status } = await next.fetch('/swc/use-client')
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          'directive must be placed before other expressions'
        )
      })

      it('should throw an error when "Component" is imported in server components', async () => {
        const pageFile = 'app/server-with-errors/class-component/page.js'
        const content = await next.readFile(pageFile)
        const uncomment = content.replace(
          "// import { Component } from 'react'",
          "import { Component } from 'react'"
        )
        await next.patchFile(pageFile, uncomment)
        const res = await next.fetch('/server-with-errors/class-component')
        await next.patchFile(pageFile, content)

        await check(async () => {
          const { status } = await next.fetch(
            '/server-with-errors/class-component'
          )
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          `You’re importing a class component. It only works in a Client Component`
        )
      })

      it('should allow to use and handle rsc poisoning client-only', async () => {
        const file =
          'app/server-with-errors/client-only-in-server/client-only-lib.js'
        const content = await next.readFile(file)
        const uncomment = content.replace(
          "// import 'client-only'",
          "import 'client-only'"
        )

        await next.patchFile(file, uncomment)
        const res = await next.fetch(
          '/server-with-errors/client-only-in-server'
        )
        await next.patchFile(file, content)

        await check(async () => {
          const { status } = await next.fetch(
            '/server-with-errors/client-only-in-server'
          )
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          `You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with \\"use client\\", so they're Server Components by default.`
        )
      })

      it('should allow to use and handle rsc poisoning server-only', async () => {
        const file =
          'app/client-with-errors/server-only-in-client/server-only-lib.js'
        const content = await next.readFile(file)
        const uncomment = content.replace(
          "// import 'server-only'",
          "import 'server-only'"
        )

        await next.patchFile(file, uncomment)
        const res = await next.fetch(
          '/client-with-errors/server-only-in-client'
        )
        await next.patchFile(file, content)

        await check(async () => {
          const { status } = await next.fetch(
            '/client-with-errors/server-only-in-client'
          )
          return status
        }, /200/)

        expect(res.status).toBe(500)
        expect(await res.text()).toContain(
          `You're importing a component that needs server-only. That only works in a Server Component but one of its parents is marked with \\"use client\\", so it's a Client Component.`
        )
      })

      it('should error for invalid undefined module retuning from next dynamic', async () => {
        const file = 'app/client-with-errors/dynamic/page.js'
        const content = await next.readFile(file)

        const browser = await next.browser('/client-with-errors/dynamic')

        await next.patchFile(
          file,
          content.replace(
            '() => <p id="dynamic-world">hello dynamic world</p>',
            'undefined'
          )
        )

        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxHeader(browser)).toContain(
          `Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function.`
        )

        await next.patchFile(file, content)
        await browser.waitForElementByCss('#dynamic-world')
      })

      it('should be possible to open the import trace files in your editor', async () => {
        const componentFile = 'app/editor-links/component.js'
        const fileContent = await next.readFile(componentFile)

        let editorRequestsCount = 0
        const browser = await next.browser('/editor-links', {
          beforePageLoad(page) {
            page.route('**/__nextjs_launch-editor**', (route) => {
              editorRequestsCount += 1
              route.fulfill()
            })
          },
        })

        await next.patchFile(
          componentFile,
          fileContent.replace(
            "// import { useState } from 'react'",
            "import { useState } from 'react'"
          )
        )

        expect(await hasRedbox(browser, true)).toBe(true)
        await check(() => getRedboxHeader(browser), /Failed to compile/)

        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "./app/editor-links/component.js
          ReactServerComponentsError:

          You're importing a component that needs useState. It only works in a Client Component but none of its parents are marked with \\"use client\\", so they're Server Components by default.

             ,-[1:1]
           1 | import { useState } from 'react'
             :          ^^^^^^^^
           2 | export default function Component() {
           3 |   return <div id=\\"component-editor-links\\">Component</div>
           4 | }
             \`----

          Maybe one of these should be marked as a client entry with \\"use client\\":
          app/editor-links/component.js
          app/editor-links/page.js"
        `)

        await browser.waitForElementByCss('[data-with-open-in-editor-link]')
        const collapsedFrameworkGroups = await browser.elementsByCss(
          '[data-with-open-in-editor-link]'
        )
        for (const collapsedFrameworkButton of collapsedFrameworkGroups) {
          await collapsedFrameworkButton.click()
        }

        await check(() => editorRequestsCount, /2/)

        // Fix file
        await next.patchFile(componentFile, fileContent)
        await browser.waitForElementByCss('#component-editor-links')
      })

      it('should throw an error when error file is a server component', async () => {
        const browser = await next.browser('/server-with-errors/error-file')

        // Remove "use client"
        await next.patchFile(
          'app/server-with-errors/error-file/error.js',
          'export default function Error() {}'
        )
        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "./app/server-with-errors/error-file/error.js

          ./app/server-with-errors/error-file/error.js must be a Client Component. Add the \\"use client\\" directive the top of the file to resolve this issue.

             ,----
           1 | export default function Error() {}
             : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
             \`----

          Import path:
            app/server-with-errors/error-file/error.js"
        `)

        // Add "use client"
        await next.patchFile(
          'app/server-with-errors/error-file/error.js',
          '"use client"'
        )
        expect(await hasRedbox(browser, false)).toBe(false)

        // Empty file
        await next.patchFile('app/server-with-errors/error-file/error.js', '')
        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "./app/server-with-errors/error-file/error.js

          ./app/server-with-errors/error-file/error.js must be a Client Component. Add the \\"use client\\" directive the top of the file to resolve this issue.

             ,----
           1 |  
             : ^
             \`----

          Import path:
            app/server-with-errors/error-file/error.js"
        `)

        // Fix
        await next.patchFile(
          'app/server-with-errors/error-file/error.js',
          '"use client"'
        )
        expect(await hasRedbox(browser, false)).toBe(false)
      })
    }
  )
}
