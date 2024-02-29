import { FileRef, nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import path from 'path'
import { sandbox } from 'development-sandbox'
import { outdent } from 'outdent'

describe('Error overlay - RSC build errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'rsc-build-errors')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  })

  it('should throw an error when getServerSideProps is used', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/client-with-errors/get-server-side-props'
    )

    const pageFile = 'app/client-with-errors/get-server-side-props/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      '// export function getServerSideProps',
      'export function getServerSideProps'
    )
    await session.patch(pageFile, uncomment)

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      '"getServerSideProps" is not supported in app/'
    )

    await cleanup()
  })

  it('should throw an error when metadata export is used in client components', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/client-with-errors/metadata-export'
    )

    const pageFile = 'app/client-with-errors/metadata-export/page.js'
    const content = await next.readFile(pageFile)

    // Add `metadata` error
    let uncomment = content.replace(
      '// export const metadata',
      'export const metadata'
    )
    await session.patch(pageFile, uncomment)
    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      'You are attempting to export "metadata" from a component marked with "use client", which is disallowed.'
    )

    // Restore file
    await session.patch(pageFile, content)
    expect(await session.hasRedbox()).toBe(false)

    // Add `generateMetadata` error
    uncomment = content.replace(
      '// export async function generateMetadata',
      'export async function generateMetadata'
    )
    await session.patch(pageFile, uncomment)
    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      'You are attempting to export "generateMetadata" from a component marked with "use client", which is disallowed.'
    )

    // Fix the error again to test error overlay works with hmr rebuild
    await session.patch(pageFile, content)
    expect(await session.hasRedbox()).toBe(false)

    await cleanup()
  })

  it('should throw an error when metadata exports are used together in server components', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/metadata-export'
    )

    const pageFile = 'app/server-with-errors/metadata-export/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      '// export async function generateMetadata',
      'export async function generateMetadata'
    )

    await session.patch(pageFile, uncomment)
    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      '"metadata" and "generateMetadata" cannot be exported at the same time, please keep one of them.'
    )

    await cleanup()
  })

  // TODO: investigate flakey test case
  it.skip('should throw an error when getStaticProps is used', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/client-with-errors/get-static-props'
    )

    const pageFile = 'app/client-with-errors/get-static-props/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      '// export function getStaticProps',
      'export function getStaticProps'
    )
    await session.patch(pageFile, uncomment)
    await next.patchFile(pageFile, content)

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      '"getStaticProps" is not supported in app/'
    )

    await cleanup()
  })

  it('should error when page component export is not valid', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/page-export'
    )

    await next.patchFile(
      'app/server-with-errors/page-export/page.js',
      'export const a = 123'
    )

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxDescription()).toInclude(
      'The default export is not a React Component in page: "/server-with-errors/page-export"'
    )

    await cleanup()
  })

  it('should error when page component export is not valid on initial load', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/page-export-initial-error'
    )

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxDescription()).toInclude(
      'The default export is not a React Component in page: "/server-with-errors/page-export-initial-error"'
    )

    await cleanup()
  })

  it('should throw an error when "use client" is on the top level but after other expressions', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/swc/use-client'
    )

    const pageFile = 'app/swc/use-client/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace("// 'use client'", "'use client'")
    await next.patchFile(pageFile, uncomment)

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      'directive must be placed before other expressions'
    )

    await cleanup()
  })

  it('should throw an error when "Component" is imported in server components', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/class-component'
    )

    const pageFile = 'app/server-with-errors/class-component/page.js'
    const content = await next.readFile(pageFile)
    const uncomment = content.replace(
      "// import { Component } from 'react'",
      "import { Component } from 'react'"
    )
    await session.patch(pageFile, uncomment)

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      `You’re importing a class component. It only works in a Client Component`
    )

    await cleanup()
  })

  it('should allow to use and handle rsc poisoning client-only', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/client-only-in-server'
    )

    const file =
      'app/server-with-errors/client-only-in-server/client-only-lib.js'
    const content = await next.readFile(file)
    const uncomment = content.replace(
      "// import 'client-only'",
      "import 'client-only'"
    )
    await next.patchFile(file, uncomment)

    expect(await session.hasRedbox()).toBe(true)
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

        You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.\\nLearn more: https://nextjs.org/docs/getting-started/react-essentials\\n\\n"
      `)
    } else {
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
      )
    }

    await cleanup()
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
  ]
  for (const api of invalidReactServerApis) {
    it(`should error when ${api} from react is used in server component`, async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        `/server-with-errors/react-apis/${api.toLowerCase()}`
      )

      expect(await session.hasRedbox()).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        // `Component` has a custom error message
        api === 'Component'
          ? `You’re importing a class component. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
          : `You're importing a component that needs ${api}. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`
      )

      await cleanup()
    })
  }

  const invalidReactDomServerApis = [
    'findDOMNode',
    'flushSync',
    'unstable_batchedUpdates',
    'useFormStatus',
    'useFormState',
  ]
  for (const api of invalidReactDomServerApis) {
    it(`should error when ${api} from react-dom is used in server component`, async () => {
      const { session, cleanup } = await sandbox(
        next,
        undefined,
        `/server-with-errors/react-dom-apis/${api.toLowerCase()}`
      )

      expect(await session.hasRedbox()).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a component that needs ${api}. It only works in a Client Component but none of its parents are marked with "use client", so they're Server Components`
      )

      await cleanup()
    })
  }

  it('should allow to use and handle rsc poisoning server-only', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/client-with-errors/server-only-in-client'
    )

    const file =
      'app/client-with-errors/server-only-in-client/server-only-lib.js'
    const content = await next.readFile(file)
    const uncomment = content.replace(
      "// import 'server-only'",
      "import 'server-only'"
    )

    await session.patch(file, uncomment)

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      `You're importing a component that needs server-only. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component.`
    )

    await cleanup()
  })

  it('should error for invalid undefined module retuning from next dynamic', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/client-with-errors/dynamic'
    )

    const file = 'app/client-with-errors/dynamic/page.js'
    const content = await next.readFile(file)
    await session.patch(
      file,
      content.replace('() => <p>hello dynamic world</p>', 'undefined')
    )

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxDescription()).toInclude(
      `Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function.`
    )

    await cleanup()
  })

  it('should throw an error when error file is a server component', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/error-file'
    )

    // Remove "use client"
    await session.patch(
      'app/server-with-errors/error-file/error.js',
      'export default function Error() {}'
    )

    expect(await session.hasRedbox()).toBe(true)
    await check(
      () => session.getRedboxSource(),
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
        Learn more: https://nextjs.org/docs/getting-started/react-essentials#client-components"
      `)
    } else {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
        "./app/server-with-errors/error-file/error.js
        Error: 
          x TEST_DIR/app/server-with-errors/error-file/error.js must be a Client Component. Add the "use client" directive the top
          | of the file to resolve this issue.
          | Learn more: https://nextjs.org/docs/getting-started/react-essentials#client-components
          | 
          | 
           ,-[TEST_DIR/app/server-with-errors/error-file/error.js:1:1]
         1 | export default function Error() {}
           : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           \`----

        Import trace for requested module:
        ./app/server-with-errors/error-file/error.js"
      `)
    }

    await cleanup()
  })

  it('should throw an error when error file is a server component with empty error file', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/error-file'
    )

    // Empty file
    await session.patch('app/server-with-errors/error-file/error.js', '')

    expect(await session.hasRedbox()).toBe(true)
    await check(() => session.getRedboxSource(), /must be a Client Component/)

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

    await cleanup()
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

    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/metadata/mutate'
    )

    await session.patch(pagePath, content)

    await check(
      async () => ((await session.hasRedbox()) ? 'success' : 'fail'),
      /success/
    )

    expect(await session.getRedboxDescription()).toContain(
      'Cannot add property x, object is not extensible'
    )

    await cleanup()
  })
})
