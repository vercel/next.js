import path from 'path'
import { outdent } from 'outdent'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('Error overlay - RSC runtime errors', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'rsc-runtime-errors')),
  })

  it('should show runtime errors if invalid client API from node_modules is executed', async () => {
    await next.patchFile(
      'app/server/page.js',
      outdent`
      import { callClientApi } from 'client-package'
      export default function Page() {
        callClientApi()
        return 'page'
      }
    `
    )

    const browser = await next.browser('/server')

    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "TypeError: useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component",
       "environmentLabel": "Server",
       "label": "Unhandled Runtime Error",
       "source": "app/server/page.js (3:16) @ Page
     > 3 |   callClientApi()
         |                ^",
       "stack": [
         "Page app/server/page.js (3:16)",
       ],
     }
    `)
  })

  it('should show runtime errors if invalid server API from node_modules is executed', async () => {
    await next.patchFile(
      'app/client/page.js',
      outdent`
      'use client'
      import { callServerApi } from 'server-package'
      export default function Page() {
        callServerApi()
        return 'page'
      }
    `
    )

    const browser = await next.browser('/client')

    // TODO(veil): Inconsistent cursor position
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: \`cookies\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "app/client/page.js (4:15) @ Page
       > 4 |   callServerApi()
           |               ^",
         "stack": [
           "Page app/client/page.js (4:15)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: \`cookies\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "app/client/page.js (4:16) @ Page
       > 4 |   callServerApi()
           |                ^",
         "stack": [
           "Page app/client/page.js (4:16)",
         ],
       }
      `)
    }
  })

  it('should show source code for jsx errors from server component', async () => {
    await next.patchFile(
      'app/server/page.js',
      outdent`
        export default function Page() {
          return <div>{alert('warn')}</div>
        }
      `
    )

    const browser = await next.browser('/server')

    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "ReferenceError: alert is not defined",
       "environmentLabel": "Server",
       "label": "Unhandled Runtime Error",
       "source": "app/server/page.js (2:16) @ Page
     > 2 |   return <div>{alert('warn')}</div>
         |                ^",
       "stack": [
         "Page app/server/page.js (2:16)",
       ],
     }
    `)
  })
})
