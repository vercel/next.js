import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

// TODO(new-dev-overlay): Remove this once old dev overlay fork is removed
const isNewDevOverlay =
  process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true'

describe('app-dir - server-component-next-dynamic-ssr-false', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should error when use dynamic ssr:false in server component', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }

    expect(redbox.description).toBe('Failed to compile')

    // TODO(new-dev-overlay): Remove this once old dev overlay fork is removed
    if (isNewDevOverlay) {
      if (process.env.TURBOPACK) {
        expect(redbox.source).toMatchInlineSnapshot(`
         "./app/page.js (3:23)
         Ecmascript file had an error
           1 | import dynamic from 'next/dynamic'
           2 |
         > 3 | const DynamicClient = dynamic(() => import('./client'), { ssr: false })
             |                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           4 |
           5 | export default function Page() {
           6 |   return <DynamicClient />

         \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a client component."
        `)
      } else {
        expect(redbox.source).toMatchInlineSnapshot(`
         "./app/page.js
         Error:   x \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a client component.
            ,-[3:1]
          1 | import dynamic from 'next/dynamic'
          2 | 
          3 | const DynamicClient = dynamic(() => import('./client'), { ssr: false })
            :                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
          4 | 
          5 | export default function Page() {
          6 |   return <DynamicClient />
            \`----"
        `)
      }
    } else {
      if (process.env.TURBOPACK) {
        expect(redbox.source).toMatchInlineSnapshot(`
         "./app/page.js (3:23)
         Ecmascript file had an error
           1 | import dynamic from 'next/dynamic'
           2 |
         > 3 | const DynamicClient = dynamic(() => import('./client'), { ssr: false })
             |                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           4 |
           5 | export default function Page() {
           6 |   return <DynamicClient />

         \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a client component."
        `)
      } else {
        expect(redbox.source).toMatchInlineSnapshot(`
                 "./app/page.js
                 Error:   x \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a client component.
                    ,-[3:1]
                  1 | import dynamic from 'next/dynamic'
                  2 | 
                  3 | const DynamicClient = dynamic(() => import('./client'), { ssr: false })
                    :                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                  4 | 
                  5 | export default function Page() {
                  6 |   return <DynamicClient />
                    \`----"
              `)
      }
    }
  })
})
