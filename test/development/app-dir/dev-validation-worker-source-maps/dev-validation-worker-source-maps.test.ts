import { nextTestSetup } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'

// Validation errors are logged with source-mapped frames, and the routes below
// cover the two cases that differ in where that source map comes from. Node.js
// caches source maps per isolate and per chunk file, so a validation pass
// running on a worker thread only has maps for the chunks that thread loaded.
// It currently never renders server components, and the built entry reaches
// segment modules through lazy getters, so it loads whatever `loadComponents`
// pulls in and nothing else: code in the route's own chunk resolves, a module
// the bundler splits into a chunk of its own does not, and the worker reads the
// `.map` emitted next to that chunk instead. Only Turbopack emits one, which is
// why validation runs in process under Webpack, so the two bundlers arrive at
// the same frames by different means. Each route owns its copy of the module,
// because a module shared between routes lands in whichever chunk the first
// compiled route put it in, which would make these snapshots depend on the
// order the routes run in.
describe('dev-validation-worker-source-maps', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: { NEXT_TEST_LOG_VALIDATION: '1' },
  })

  it('symbolicates a cookie read in a statically imported module', async () => {
    const browser = await next.browser('/static')

    // The module stays in the route's own chunk, so its map is in the cache of
    // whichever thread validates the route.
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

  it('symbolicates a frame in a module updated while the server runs', async () => {
    // Load the route first so its chunk is evaluated, then edit it. The update
    // gives the module a source URL of its own, which is a different input to
    // source map resolution than the chunk path a freshly loaded module has.
    // The edit refreshes the route on its own, so the frames below come from
    // the render that follows it.
    const browser = await next.browser('/updated')

    // That first load is validated as well, and passes. Wait for it to finish
    // and mark the output, so what is read below is what the edit produced.
    await getDevCliValidationOutput(await browser.url(), () => next.cliOutput)
    const outputIndex = next.cliOutput.length

    await next.patchFile('app/updated/page.tsx', (content) =>
      content.replace('// await new Promise', 'await new Promise')
    )

    if (isTurbopack) {
      // TODO: The frame is not symbolicated. Turbopack gives a module updated
      // in place a source URL of its own, and the validation worker cannot
      // resolve a source map for it, so the chunk shows through instead of the
      // page. Webpack validates in process, where it resolves.
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "code": "E1440",
         "description": "Next.js encountered uncached data during prerendering.",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": null,
         "stack": [
           "<FIXME-file-protocol>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "code": "E1440",
         "description": "Next.js encountered uncached data during prerendering.",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/updated/page.tsx (5:9) @ UpdatedPage
       > 5 |   await new Promise((resolve) => setTimeout(resolve, 0))
           |         ^",
         "stack": [
           "UpdatedPage app/updated/page.tsx (5:9)",
         ],
       }
      `)
    }

    const output = await getDevCliValidationOutput(await browser.url(), () =>
      next.cliOutput.slice(outputIndex)
    )

    if (isTurbopack) {
      // TODO: Same unresolved frame as above.
      expect(output).toMatchInlineSnapshot(`
       "Error: Route "/updated": Next.js encountered uncached data during prerendering.

       \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

       Ways to fix this:
         - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
         - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
         - [block] Set \`export const instant = false\` to allow a blocking route

       Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
           at UpdatedPage (<next-dist-dir>)"
      `)
    } else {
      expect(output).toMatchInlineSnapshot(`
       "Error: Route "/updated": Next.js encountered uncached data during prerendering.

       \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

       Ways to fix this:
         - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
         - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
         - [block] Set \`export const instant = false\` to allow a blocking route

       Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
           at UpdatedPage (app/updated/page.tsx:5:9)
         3 |   // module is updated in place after the route has already been loaded.
         4 |
       > 5 |   await new Promise((resolve) => setTimeout(resolve, 0))
           |         ^
         6 |
         7 |   return <p>updated</p>
         8 | }"
      `)
    }
  })

  it('symbolicates a cookie read in a dynamically imported module', async () => {
    const browser = await next.browser('/dynamic')
    const output = await getDevCliValidationOutput(
      await browser.url(),
      () => next.cliOutput
    )

    // A module in a chunk of its own is the case a worker thread cannot resolve
    // from Node.js' cache: under Turbopack the worker falls back to the emitted
    // `.map`, and under Webpack validation runs in process, where the module
    // was evaluated and its map is cached.
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
  })
})
