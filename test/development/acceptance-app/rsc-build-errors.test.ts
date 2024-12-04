import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

describe('Error overlay - RSC build errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'rsc-build-errors')),
    skipStart: true,
  })

  it('should throw an error when getServerSideProps is used', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/client-with-errors/get-server-side-props'
    )
    const { session } = sandbox
    const pageFile = 'app/client-with-errors/get-server-side-props/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      '// export function getServerSideProps',
      'export function getServerSideProps'
    )
    await session.patch(pageFile, uncomment)

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toInclude(
      '"getServerSideProps" is not supported in app/'
    )
  })

  it('should throw an error when metadata export is used in client components', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/client-with-errors/metadata-export'
    )
    const { session } = sandbox
    const pageFile = 'app/client-with-errors/metadata-export/page.js'
    const content = await next.readFile(pageFile)

    // Add `metadata` error
    let uncomment = content.replace(
      '// export const metadata',
      'export const metadata'
    )
    await session.patch(pageFile, uncomment)
    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toInclude(
      'You are attempting to export "metadata" from a component marked with "use client", which is disallowed.'
    )

    // Restore file
    await session.patch(pageFile, content)
    await session.assertNoRedbox()

    // Add `generateMetadata` error
    uncomment = content.replace(
      '// export async function generateMetadata',
      'export async function generateMetadata'
    )
    await session.patch(pageFile, uncomment)
    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toInclude(
      'You are attempting to export "generateMetadata" from a component marked with "use client", which is disallowed.'
    )

    // Fix the error again to test error overlay works with hmr rebuild
    await session.patch(pageFile, content)
    await session.assertNoRedbox()
  })

  it('should throw an error when metadata exports are used together in server components', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/server-with-errors/metadata-export'
    )
    const { session } = sandbox
    const pageFile = 'app/server-with-errors/metadata-export/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      '// export async function generateMetadata',
      'export async function generateMetadata'
    )

    await session.patch(pageFile, uncomment)
    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toInclude(
      '"metadata" and "generateMetadata" cannot be exported at the same time, please keep one of them.'
    )
  })

  // TODO: investigate flakey test case
  it.skip('should throw an error when getStaticProps is used', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/client-with-errors/get-static-props'
    )
    const { session } = sandbox
    const pageFile = 'app/client-with-errors/get-static-props/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      '// export function getStaticProps',
      'export function getStaticProps'
    )
    await session.patch(pageFile, uncomment)
    await next.patchFile(pageFile, content)

    await session.assertHasRedbox({ pageResponseCode: 500 })
    expect(await session.getRedboxSource()).toInclude(
      '"getStaticProps" is not supported in app/'
    )
  })

  it('should throw an error when "use client" is on the top level but after other expressions', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/swc/use-client'
    )
    const { session } = sandbox
    const pageFile = 'app/swc/use-client/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace("// 'use client'", "'use client'")
    await next.patchFile(pageFile, uncomment)

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toInclude(
      'directive must be placed before other expressions'
    )
  })

  it('should throw an error when "Component" is imported in server components', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/server-with-errors/class-component'
    )
    const { session } = sandbox
    const pageFile = 'app/server-with-errors/class-component/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      "// import { Component } from 'react'",
      "import { Component } from 'react'"
    )
    await session.patch(pageFile, uncomment)

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toInclude(
      `You’re importing a class component. It only works in a Client Component`
    )
  })

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

    await session.assertHasRedbox()
    if (isTurbopack) {
      // TODO: fix the issue ordering.
      // turbopack emits the resolve issue first instead of the transform issue.
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "./app/server-with-errors/client-only-in-server/client-only-lib.js:1:1
        Ecmascript file had an error
        > 1 | import 'client-only'
            | ^^^^^^^^^^^^^^^^^^^^
          2 |
          3 | export default function ClientOnlyLib() {
          4 |   return 'client-only-lib'

        You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\\nLearn more: https://nextjs.org/docs/app/building-your-application/rendering\\n\\n"
      `)
    } else {
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
      )
    }
  })

  const invalidReactServerApis = [
    'Component',
    'createContext',
    'createFactory',
    'PureComponent',
    'useDeferredValue',
    'useEffect',
    'useImperativeHandle',
    'useInsertionEffect',
    'useLayoutEffect',
    'useReducer',
    'useRef',
    'useState',
    'useSyncExternalStore',
    'useTransition',
    'useOptimistic',
    'useActionState',
  ]
  for (const api of invalidReactServerApis) {
    it(`should error when ${api} from react is used in server component`, async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        `/server-with-errors/react-apis/${api.toLowerCase()}`
      )
      const { session } = sandbox
      await session.assertHasRedbox({ pageResponseCode: 500 })
      expect(await session.getRedboxSource()).toInclude(
        // `Component` has a custom error message
        api === 'Component'
          ? `You’re importing a class component. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
          : `You're importing a component that needs \`${api}\`. This React hook only works in a client component. To fix, mark the file (or its parent) with the \`"use client"\` directive.`
      )
    })
  }

  const invalidReactDomServerApis = [
    'flushSync',
    'unstable_batchedUpdates',
    'useFormStatus',
    'useFormState',
  ]
  for (const api of invalidReactDomServerApis) {
    it(`should error when ${api} from react-dom is used in server component`, async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        `/server-with-errors/react-dom-apis/${api.toLowerCase()}`
      )
      const { session } = sandbox
      await session.assertHasRedbox({ pageResponseCode: 500 })
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a component that needs \`${api}\`. This React hook only works in a client component. To fix, mark the file (or its parent) with the \`"use client"\` directive.`
      )
    })
  }

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

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toInclude(
      `You're importing a component that needs "server-only". That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component.`
    )
  })

  it('should error for invalid undefined module retuning from next dynamic', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/client-with-errors/dynamic'
    )
    const { session } = sandbox
    const file = 'app/client-with-errors/dynamic/page.js'
    const content = await next.readFile(file)
    await session.patch(
      file,
      content.replace('() => <p>hello dynamic world</p>', 'undefined')
    )

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toInclude(
      `Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function.`
    )
  })

  it('should throw an error when error file is a server component', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/server-with-errors/error-file'
    )
    const { session } = sandbox
    // Remove "use client"
    await session.patch(
      'app/server-with-errors/error-file/error.js',
      'export default function Error() {}'
    )

    await session.assertHasRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /must be a Client \n| Component/
    )
    if (process.env.TURBOPACK) {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
        "./app/server-with-errors/error-file/error.js:1:1
        Ecmascript file had an error
        > 1 | export default function Error() {}
            | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

        app/server-with-errors/error-file/error.js must be a Client Component. Add the "use client" directive the top of the file to resolve this issue.
        Learn more: https://nextjs.org/docs/app/api-reference/directives/use-client"
      `)
    } else {
      await expect(session.getRedboxSource()).resolves.toMatch(
        /Add the "use client"/
      )

      // TODO: investigate flakey snapshot due to spacing below
      // expect(next.normalizeTestDirContent(await session.getRedboxSource()))
      //   .toMatchInlineSnapshot(`
      //   "./app/server-with-errors/error-file/error.js
      //   Error:   x TEST_DIR/app/server-with-errors/error-file/error.js must be a Client
      //     | Component. Add the "use client" directive the top of the file to resolve this issue.
      //     | Learn more: https://nextjs.org/docs/app/api-reference/directives/use-client
      //     |
      //     |
      //      ,----
      //    1 | export default function Error() {}
      //      : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      //      \`----

      //   Import trace for requested module:
      //   ./app/server-with-errors/error-file/error.js"
      // `)
    }
  })

  it('should throw an error when error file is a server component with empty error file', async () => {
    await using sandbox = await createSandbox(
      next,
      undefined,
      '/server-with-errors/error-file'
    )
    const { session } = sandbox
    // Empty file
    await session.patch('app/server-with-errors/error-file/error.js', '')

    await session.assertHasRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /Add the "use client"/
    )

    // TODO: investigate flakey snapshot due to spacing below
    // expect(next.normalizeTestDirContent(await session.getRedboxSource()))
    //   .toMatchInlineSnapshot(n`
    //   "./app/server-with-errors/error-file/error.js
    //   ReactServerComponentsError:

    //   ./app/server-with-errors/error-file/error.js must be a Client Component. Add the "use client" directive the top of the file to resolve this issue.

    //      ,-[TEST_DIR/app/server-with-errors/error-file/error.js:1:1]
    //    1 |
    //      : ^
    //      \`----

    //   Import path:
    //   ./app/server-with-errors/error-file/error.js"
    // `)
  })

  it('should freeze parent resolved metadata to avoid mutating in generateMetadata', async () => {
    const pagePath = 'app/metadata/mutate/page.js'
    const content = outdent`
      export default function page(props) {
        return <p>mutate</p>
      }

      export async function generateMetadata(props, parent) {
        const parentMetadata = await parent
        parentMetadata.x = 1
        return {
          ...parentMetadata,
        }
      }
    `

    await using sandbox = await createSandbox(
      next,
      undefined,
      '/metadata/mutate'
    )
    const { session } = sandbox
    await session.patch(pagePath, content)

    await session.assertHasRedbox()

    expect(await session.getRedboxDescription()).toContain(
      'Cannot add property x, object is not extensible'
    )
  })
})
