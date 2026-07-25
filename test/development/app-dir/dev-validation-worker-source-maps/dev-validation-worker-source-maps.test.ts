import { nextTestSetup } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'

// The dev validation worker symbolicates the frames it logs on its own thread,
// where Node.js caches source maps only for the chunk files that thread loaded.
// The worker never renders server components, and the built entry reaches
// segment modules through lazy getters, so a module the bundler splits into a
// chunk of its own is never loaded there and has no map in that cache. The
// worker resolves those by reading the `.map` the bundler emitted next to the
// chunk, which only exists for Turbopack. Each route below owns its copy of the
// module, because a module shared between routes lands in whichever chunk the
// first compiled route put it in, which would make these snapshots depend on
// the order the routes run in.
describe('dev-validation-worker-source-maps', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: { NEXT_TEST_LOG_VALIDATION: '1' },
  })

  it('symbolicates a cookie read in a statically imported module', async () => {
    const browser = await next.browser('/static')

    // The module stays in the route's own chunk, which the worker loads, so its
    // frames resolve the same way they do for in-process validation.
    expect(
      await getDevCliValidationOutput(await browser.url(), () => next.cliOutput)
    ).toMatchInlineSnapshot(`
     "Error: Route "/static": Next.js encountered runtime data during prerendering.

     \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

     Ways to fix this:
       - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
       - [block] Set \`export const instant = false\` to allow a blocking route

     Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
         at readCookie (app/static/read-cookie.ts:4:30)
         at StaticPage (app/static/page.tsx:4:41)
       2 |
       3 | export async function readCookie(): Promise<string> {
     > 4 |   const store = await cookies()
         |                              ^
       5 |   return store.get('probe')?.value ?? 'none'
       6 | }
       7 |"
    `)
  })

  it('symbolicates a cookie read in a dynamically imported module', async () => {
    const browser = await next.browser('/dynamic')
    const output = await getDevCliValidationOutput(
      await browser.url(),
      () => next.cliOutput
    )

    // The module lands in a chunk of its own, which the worker never loads,
    // so it has no map for it in the worker thread's cache.
    if (isTurbopack) {
      // Reading the `.map` next to the chunk resolves it anyway.
      expect(output).toMatchInlineSnapshot(`
       "Error: Route "/dynamic": Next.js encountered runtime data during prerendering.

       \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

       Ways to fix this:
         - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
         - [block] Set \`export const instant = false\` to allow a blocking route

       Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
           at readCookie (app/dynamic/read-cookie.ts:4:30)
           at DynamicPage (app/dynamic/page.tsx:4:31)
         2 |
         3 | export async function readCookie(): Promise<string> {
       > 4 |   const store = await cookies()
           |                              ^
         5 |   return store.get('probe')?.value ?? 'none'
         6 | }
         7 |"
      `)
    } else {
      // Webpack keeps the module path but reports the position it has in the
      // compiled output. It holds its dev source maps in the compiler rather
      // than writing them next to the chunks, so unlike for Turbopack there is
      // nothing on disk for the worker to read instead.
      //
      // TODO(veil): Turn `experimental.devValidationWorker` off for Webpack
      // until the worker can resolve these frames.
      expect(output).toMatchInlineSnapshot(`
       "Error: Route "/dynamic": Next.js encountered runtime data during prerendering.

       \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

       Ways to fix this:
         - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
         - [block] Set \`export const instant = false\` to allow a blocking route

       Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
           at readCookie (webpack-internal:///(rsc)/./app/dynamic/read-cookie.ts:8:78)
           at DynamicPage (app/dynamic/page.tsx:4:31)
         2 |   const { readCookie } = await import('./read-cookie')
         3 |
       > 4 |   return <p id="value">{await readCookie()}</p>
           |                               ^
         5 | }
         6 |"
      `)
    }
  })
})
