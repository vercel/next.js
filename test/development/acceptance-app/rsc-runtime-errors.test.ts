import path from 'path'
import { outdent } from 'outdent'
import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
  getVersionCheckerText,
} from 'next-test-utils'

const isNewDevOverlay =
  process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true'

describe('Error overlay - RSC runtime errors', () => {
  const { next } = nextTestSetup({
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

    await assertHasRedbox(browser)
    const errorDescription = await getRedboxDescription(browser)

    expect(errorDescription).toContain(
      `Error: useState only works in Client Components. Add the "use client" directive at the top of the file to use it. Read more: https://nextjs.org/docs/messages/react-client-hook-in-server-component`
    )
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

    await assertHasRedbox(browser)

    const errorDescription = await getRedboxDescription(browser)
    expect(errorDescription).toContain(
      'Error: `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
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
    await assertHasRedbox(browser)

    const errorDescription = await getRedboxDescription(browser)

    expect(errorDescription).toContain(`Error: alert is not defined`)
  })

  it('should show the userland code error trace when fetch failed error occurred', async () => {
    await next.patchFile(
      'app/server/page.js',
      outdent`
        export default async function Page() {
          await fetch('http://locahost:3000/xxxx')
          return 'page'
        }
        `
    )
    const browser = await next.browser('/server')
    await assertHasRedbox(browser)

    const source = await getRedboxSource(browser)
    // Can show the original source code
    expect(source).toContain('app/server/page.js')
    expect(source).toContain(`await fetch('http://locahost:3000/xxxx')`)
  })

  it('should contain nextjs version check in error overlay', async () => {
    await next.patchFile(
      'app/server/page.js',
      outdent`
        export default function Page() {
          throw new Error('test')
        }
        `
    )
    const browser = await next.browser('/server')

    await assertHasRedbox(browser)
    const versionText = await getVersionCheckerText(browser)
    if (isNewDevOverlay) {
      expect(versionText).toMatch(/Next.js [\w.-]+/)
    } else {
      expect(versionText).toMatch(/Next.js \([\w.-]+\)/)
    }
  })

  it('should not show the bundle layer info in the file trace', async () => {
    await next.patchFile(
      'app/server/page.js',
      outdent`
        export default function Page() {
          throw new Error('test')
        }
        `
    )
    const browser = await next.browser('/server')

    await assertHasRedbox(browser)
    const source = await getRedboxSource(browser)
    expect(source).toContain('app/server/page.js')
    expect(source).not.toContain('//app/server/page.js')
    // Does not contain webpack traces in file path
    expect(source).not.toMatch(/webpack(-internal:)?\/\//)
  })
})
