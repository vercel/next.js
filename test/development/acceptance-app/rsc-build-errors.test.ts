import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'
import { runRscBuildErrorsTests } from './rsc-build-errors.util'

runRscBuildErrorsTests(({ next }) => {
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

    await session.waitForRedbox()
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
    await session.waitForRedbox()
    expect(await session.getRedboxSource()).toInclude(
      'You are attempting to export "metadata" from a component marked with "use client", which is disallowed.'
    )

    // Restore file
    await session.patch(pageFile, content)
    await session.waitForNoRedbox()

    // Add `generateMetadata` error
    uncomment = content.replace(
      '// export async function generateMetadata',
      'export async function generateMetadata'
    )
    await session.patch(pageFile, uncomment)
    await session.waitForRedbox()
    expect(await session.getRedboxSource()).toInclude(
      'You are attempting to export "generateMetadata" from a component marked with "use client", which is disallowed.'
    )

    // Fix the error again to test error overlay works with hmr rebuild
    await session.patch(pageFile, content)
    await session.waitForNoRedbox()
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
    await session.waitForRedbox()
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

    await session.waitForRedbox()
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

    await session.waitForRedbox()
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

    await session.waitForRedbox()
    expect(await session.getRedboxSource()).toInclude(
      `You’re importing a class component. It only works in a Client Component`
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

    await session.waitForRedbox()
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

    await session.waitForRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /must be a Client \n| Component/
    )
    if (process.env.IS_TURBOPACK_TEST) {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
       "./app/server-with-errors/error-file/error.js (1:1)
       Error: app/server-with-errors/error-file/error.js must be a Client Component. Add the "use client" directive the top of the file to resolve this issue.
           Learn more: https://nextjs.org/docs/app/api-reference/directives/use-client
       > 1 | export default function Error() {}
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

       Ecmascript file had an error"
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

    await session.waitForRedbox()
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

    await session.waitForRedbox()

    expect(await session.getRedboxDescription()).toContain(
      'Cannot add property x, object is not extensible'
    )
  })
})
