/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

const isRspack = process.env.NEXT_RSPACK !== undefined

const initialFiles = new Map([
  ['app/_.js', ''], // app dir need to exists, otherwise the SWC RSC checks will not run
  [
    'pages/index.js',
    outdent`
      import Comp from '../components/Comp'

      export default function Page() { return <Comp /> }
    `,
  ],
  [
    'components/Comp.js',
    outdent`
      export default function Comp() {
        return <p>Hello world</p>
      }
    `,
  ],
])

describe('Error Overlay for server components compiler errors in pages', () => {
  const { next } = nextTestSetup({
    files: {},
    skipStart: true,
  })

  test("importing 'next/headers' in pages", async () => {
    await using sandbox = await createSandbox(next, initialFiles)
    const { session } = sandbox

    await session.patch(
      'components/Comp.js',
      outdent`
        import { cookies } from 'next/headers'

        export default function Page() {
          return <p>hello world</p>
        }
      `
    )

    await session.assertHasRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /That only works in a Server Component/
    )

    if (process.env.IS_TURBOPACK_TEST) {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
       "./components/Comp.js (1:1)
       Ecmascript file had an error
       > 1 | import { cookies } from 'next/headers'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         2 |
         3 | export default function Page() {
         4 |   return <p>hello world</p>

       You're importing a component that needs "next/headers". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components

       Import traces:
         Browser:
           ./components/Comp.js
           ./pages/index.js

         SSR:
           ./components/Comp.js
           ./pages/index.js"
      `)
    } else if (isRspack) {
      expect(
        takeUpToString(
          next.normalizeTestDirContent(await session.getRedboxSource()),
          '----'
        )
      ).toMatchInlineSnapshot(`
       "./components/Comp.js
         × Module build failed:
         ╰─▶   × Error:   x You're importing a component that needs "next/headers". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
               │   |
               │
               │    ,-[1:1]
               │  1 | import { cookies } from 'next/headers'
               │    : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
               │  2 |
               │  3 | export default function Page() {
               │  4 |   return <p>hello world</p>
               │    \`----"
      `)
    } else {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
       "./components/Comp.js
       Error:   x You're importing a component that needs "next/headers". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
         |

          ,-[1:1]
        1 | import { cookies } from 'next/headers'
          : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        2 | 
        3 | export default function Page() {
        4 |   return <p>hello world</p>
          \`----

       Import trace for requested module:
       ./components/Comp.js
       ./pages/index.js"
      `)
    }
  })

  test("importing 'server-only' in pages", async () => {
    await using sandbox = await createSandbox(next, initialFiles)
    const { session } = sandbox

    await next.patchFile(
      'components/Comp.js',
      outdent`
        import 'server-only'

        export default function Page() {
          return 'hello world'
        }
      `
    )

    await session.assertHasRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /That only works in a Server Component/
    )

    if (process.env.IS_TURBOPACK_TEST) {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
       "./components/Comp.js (1:1)
       Ecmascript file had an error
       > 1 | import 'server-only'
           | ^^^^^^^^^^^^^^^^^^^^
         2 |
         3 | export default function Page() {
         4 |   return 'hello world'

       You're importing a component that needs "server-only". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components

       Import traces:
         Browser:
           ./components/Comp.js
           ./pages/index.js

         SSR:
           ./components/Comp.js
           ./pages/index.js"
      `)
    } else if (isRspack) {
      expect(
        takeUpToString(
          next.normalizeTestDirContent(await session.getRedboxSource()),
          '----'
        )
      ).toMatchInlineSnapshot(`
       "./components/Comp.js
         × Module build failed:
         ╰─▶   × Error:   x You're importing a component that needs "server-only". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
               │   |
               │
               │    ,-[1:1]
               │  1 | import 'server-only'
               │    : ^^^^^^^^^^^^^^^^^^^^
               │  2 |
               │  3 | export default function Page() {
               │  4 |   return 'hello world'
               │    \`----"
      `)
    } else {
      expect(
        takeUpToString(
          next.normalizeTestDirContent(await session.getRedboxSource()),
          'Import trace for requested module:'
        )
      ).toMatchInlineSnapshot(`
       "./components/Comp.js
       Error:   x You're importing a component that needs "server-only". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
         |

          ,-[1:1]
        1 | import 'server-only'
          : ^^^^^^^^^^^^^^^^^^^^
        2 | 
        3 | export default function Page() {
        4 |   return 'hello world'
          \`----

       Import trace for requested module:"
      `)
    }
  })

  test("importing after from 'next/server' in pages", async () => {
    await using sandbox = await createSandbox(next, initialFiles)
    const { session } = sandbox

    await next.patchFile(
      'components/Comp.js',
      outdent`
        import { after } from 'next/server'

        export default function Page() {
          return 'hello world'
        }
      `
    )

    await session.assertHasRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /That only works in a Server Component/
    )

    if (process.env.IS_TURBOPACK_TEST) {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
       "./components/Comp.js (1:10)
       Ecmascript file had an error
       > 1 | import { after } from 'next/server'
           |          ^^^^^
         2 |
         3 | export default function Page() {
         4 |   return 'hello world'

       You're importing a component that needs "after". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components

       Import traces:
         Browser:
           ./components/Comp.js
           ./pages/index.js

         SSR:
           ./components/Comp.js
           ./pages/index.js"
      `)
    } else if (isRspack) {
      expect(
        takeUpToString(
          next.normalizeTestDirContent(await session.getRedboxSource()),
          '----'
        )
      ).toMatchInlineSnapshot(`
       "./components/Comp.js
         × Module build failed:
         ╰─▶   × Error:   x You're importing a component that needs "after". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
               │   |
               │
               │    ,-[1:1]
               │  1 | import { after } from 'next/server'
               │    :          ^^^^^
               │  2 |
               │  3 | export default function Page() {
               │  4 |   return 'hello world'
               │    \`----"
      `)
    } else {
      expect(
        takeUpToString(
          next.normalizeTestDirContent(await session.getRedboxSource()),
          'Import trace for requested module:'
        )
      ).toMatchInlineSnapshot(`
       "./components/Comp.js
       Error:   x You're importing a component that needs "after". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
         |

          ,-[1:1]
        1 | import { after } from 'next/server'
          :          ^^^^^
        2 | 
        3 | export default function Page() {
        4 |   return 'hello world'
          \`----

       Import trace for requested module:"
      `)
    }
  })

  test("importing 'next/root-params' in pages", async () => {
    const files = new Map([
      ...initialFiles,
      [
        'components/Comp.js',
        outdent`
          import { foo } from 'next/root-params'

          export default function Page() {
            return 'hello world'
          }
        `,
      ],
      [
        // the import is guarded behind an experimental flag
        'next.config.js',
        outdent`
          module.exports = { experimental: { rootParams: true } }
        `,
      ],
    ])
    await using sandbox = await createSandbox(next, files)
    const { session } = sandbox

    await session.assertHasRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /That only works in a Server Component/
    )

    if (process.env.IS_TURBOPACK_TEST) {
      expect(next.normalizeTestDirContent(await session.getRedboxSource()))
        .toMatchInlineSnapshot(`
       "./components/Comp.js (1:1)
       Ecmascript file had an error
       > 1 | import { foo } from 'next/root-params'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         2 |
         3 | export default function Page() {
         4 |   return 'hello world'

       You're importing a component that needs "next/root-params". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components

       Import traces:
         Browser:
           ./components/Comp.js
           ./pages/index.js

         SSR:
           ./components/Comp.js
           ./pages/index.js"
      `)
    } else if (isRspack) {
      expect(
        takeUpToString(
          next.normalizeTestDirContent(await session.getRedboxSource()),
          '----'
        )
      ).toMatchInlineSnapshot(`
       "./components/Comp.js
         × Module build failed:
         ╰─▶   × Error:   x You're importing a component that needs "next/root-params". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
               │   |
               │
               │    ,-[1:1]
               │  1 | import { foo } from 'next/root-params'
               │    : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
               │  2 |
               │  3 | export default function Page() {
               │  4 |   return 'hello world'
               │    \`----"
      `)
    } else {
      expect(
        takeUpToString(
          next.normalizeTestDirContent(await session.getRedboxSource()),
          'Import trace for requested module:'
        )
      ).toMatchInlineSnapshot(`
       "./components/Comp.js
       Error:   x You're importing a component that needs "next/root-params". That only works in a Server Component which is not supported in the pages/ directory. Read more: https://nextjs.org/docs/app/building-your-application/rendering/server-components
         |

          ,-[1:1]
        1 | import { foo } from 'next/root-params'
          : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        2 | 
        3 | export default function Page() {
        4 |   return 'hello world'
          \`----"
      `)
    }
  })

  describe("importing 'next/cache' APIs in pages", () => {
    test.each([
      'revalidatePath',
      'revalidateTag',
      'cacheLife',
      'cacheTag',
      'revalidatePath',
      'revalidateTag',
    ])('%s is not allowed', async (api) => {
      await using sandbox = await createSandbox(next, initialFiles)
      const { session } = sandbox

      await next.patchFile(
        'components/Comp.js',
        outdent`
          import { ${api} } from 'next/cache'

          export default function Page() {
            return 'hello world'
          }
        `
      )

      await session.assertHasRedbox()
      await expect(session.getRedboxSource()).resolves.toMatch(
        `You're importing a component that needs "${api}". That only works in a Server Component which is not supported in the pages/ directory.`
      )
    })

    test.each([
      'unstable_cache', // useless in client, but doesn't technically error
      'unstable_noStore', // no-op in client, but allowed for legacy reasons
    ])('%s is allowed', async (api) => {
      await using sandbox = await createSandbox(next, initialFiles)
      const { session } = sandbox

      await next.patchFile(
        'components/Comp.js',
        outdent`
          import { ${api} } from 'next/cache'

          export default function Page() {
            return 'hello world'
          }
        `
      )

      await session.assertNoRedbox()
    })
  })
})

const takeUpToString = (text: string, str: string): string =>
  text.includes(str) ? text.slice(0, text.indexOf(str) + str.length) : text
