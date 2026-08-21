import { createSandbox } from 'development-sandbox'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'
import { runRscBuildErrorsTests } from './rsc-build-errors.util'

runRscBuildErrorsTests(({ next, isTurbopack }) => {
  it('should allow to use and handle rsc poisoning client-only', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/server-with-errors/client-only-in-server'
    )
    const { session } = sandbox
    const file =
      'app/server-with-errors/client-only-in-server/client-only-lib.js'
    const content = await next.readFile(file)
    const uncomment = content.replace(
      "// import 'client-only'",
      "import 'client-only'"
    )
    await next.patchFile(file, uncomment)

    await session.waitForRedbox()
    if (isTurbopack) {
      // TODO: fix the issue ordering.
      // turbopack emits the resolve issue first instead of the transform issue.
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
       "./app/server-with-errors/client-only-in-server/client-only-lib.js (1:1)
       Error: You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.
           Learn more: https://nextjs.org/docs/app/building-your-application/rendering
       > 1 | import 'client-only'
           | ^^^^^^^^^^^^^^^^^^^^
         2 |
         3 | export default function ClientOnlyLib() {
         4 |   return 'client-only-lib'

       Ecmascript file had an error

       Import trace:
         Server Component:
           ./app/server-with-errors/client-only-in-server/client-only-lib.js
           ./app/server-with-errors/client-only-in-server/page.js"
      `)
    } else {
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
      )
    }
  })

  it('should allow to use and handle rsc poisoning server-only', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/client-with-errors/server-only-in-client'
    )
    const { session } = sandbox
    const file =
      'app/client-with-errors/server-only-in-client/server-only-lib.js'
    const content = await next.readFile(file)
    const uncomment = content.replace(
      "// import 'server-only'",
      "import 'server-only'"
    )

    await session.patch(file, uncomment)

    await session.waitForRedbox()
    expect(await session.getRedboxSource()).toInclude(
      `You're importing a module that depends on "server-only" into a React Client Component module. This API is only available in Server Components but one of its parents is marked with "use client", so this module is also a Client Component.`
    )
  })

  it('should error when catchError from next/error is used in a server component', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            import { catchError } from 'next/error'

            export default function Page() {
              return 'Hello world'
            }
          `,
        ],
      ])
    )

    const { session } = sandbox
    await session.waitForRedbox()
    expect(await session.getRedboxSource()).toInclude(
      'You\'re importing a module that depends on `catchError` into a React Server Component module. This API is only available in Client Components. To fix, mark the file (or its parent) with the `"use client"` directive.'
    )
  })

  test.each([
    ['middleware.js', 'export function middleware() {}'],
    ['proxy.js', 'export function proxy() {}'],
    ['instrumentation.js', 'export function register() {}'],
  ])(
    'should error when catchError from next/error is imported in %s',
    async (entryFile, exportCode) => {
      const entryContents = outdent`
        import { catchError } from 'next/error'
        ${exportCode}
      `
      const initialFiles = new Map([
        [
          'app/page.js',
          outdent`
            export default function Page() {
              return 'Hello world'
            }
          `,
        ],
      ])

      if (entryFile !== 'proxy.js') {
        initialFiles.set(entryFile, entryContents)
      }

      await using sandbox = await createSandbox(next, initialFiles)

      const { session } = sandbox
      if (entryFile === 'proxy.js') {
        // A proxy build error can cause the initial browser navigation to
        // reload and clear the overlay. Introduce it after HMR connects, then
        // trigger compilation without navigating the browser.
        await session.write(entryFile, entryContents)
        await retry(async () => {
          expect((await next.fetch('/')).status).not.toBe(200)
        })
      }
      await session.waitForRedbox()
      expect(await session.getRedboxSource()).toInclude(
        'You\'re importing a module that depends on `catchError` into a React Server Component module. This API is only available in Client Components. To fix, mark the file (or its parent) with the `"use client"` directive.'
      )
    }
  )
})
