import { nextTestSetup } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'
import { retry } from 'next-test-utils'

// Validation errors are logged with source-mapped frames, and the routes below
// cover the cases that differ in where that source map comes from. Node.js
// caches source maps per isolate, so a validation pass running on a worker
// thread resolves a frame only if that thread holds the script it names. A
// chunk loaded from disk has its map beside it, but a module the server updated
// in place runs as a script of its own with the map inline, which exists only
// in the thread that evaluated it. The worker therefore applies the same
// updates the dev server does; the routes that edit a file while the server
// runs are what covers that. Under Webpack there is no worker and validation
// runs in process, so the two bundlers reach the same frames by different
// means.
//
// Each route owns its copy of the module it edits, because a module shared
// between routes lands in whichever chunk the first compiled route put it in,
// which would make these snapshots depend on the order the routes run in.
describe('dev-validation-worker-source-maps', () => {
  const { next } = nextTestSetup({
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

    await expect(browser).toDisplayCollapsedRedbox(`
     {
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

    const output = await getDevCliValidationOutput(await browser.url(), () =>
      next.cliOutput.slice(outputIndex)
    )

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

    // Edit the same module again, moving the access two lines down. The line
    // below is what the thread that validates would report from the update it
    // last applied, so a thread left behind on the first edit reports 5 again.
    const secondEditIndex = next.cliOutput.length

    await next.patchFile('app/updated/page.tsx', (content) =>
      content.replace(
        'export default async function UpdatedPage() {',
        'export default async function UpdatedPage() {\n  // A second edit,\n  // moving the access down.'
      )
    )

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Next.js encountered uncached data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/updated/page.tsx (7:9) @ UpdatedPage
     >  7 |   await new Promise((resolve) => setTimeout(resolve, 0))
          |         ^",
       "stack": [
         "UpdatedPage app/updated/page.tsx (7:9)",
       ],
     }
    `)

    expect(
      await getDevCliValidationOutput(await browser.url(), () =>
        next.cliOutput.slice(secondEditIndex)
      )
    ).toMatchInlineSnapshot(`
     "Error: Route "/updated": Next.js encountered uncached data during prerendering.

     \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

     Ways to fix this:
       - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
       - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
       - [block] Set \`export const instant = false\` to allow a blocking route

     Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
         at UpdatedPage (app/updated/page.tsx:7:9)
        5 |   // module is updated in place after the route has already been loaded.
        6 |
     >  7 |   await new Promise((resolve) => setTimeout(resolve, 0))
          |         ^
        8 |
        9 |   return <p>updated</p>
       10 | }"
    `)
  })

  it('symbolicates a frame in an imported module updated while the server runs', async () => {
    const browser = await next.browser('/shared')

    await getDevCliValidationOutput(await browser.url(), () => next.cliOutput)
    const outputIndex = next.cliOutput.length

    // The update lands in a module the page imports rather than in the page
    // itself, so the reported frames span both: the access in the imported
    // module, and the page that called it.
    await next.patchFile('app/shared/read-value.ts', (content) =>
      content
        .replace('// import { connection }', 'import { connection }')
        .replace('// await connection()', 'await connection()')
    )

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered uncached data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/shared/read-value.ts (7:19) @ readValue
     >  7 |   await connection()
          |                   ^",
       "stack": [
         "readValue app/shared/read-value.ts (7:19)",
         "SharedPage app/shared/page.tsx (4:29)",
       ],
     }
    `)

    expect(
      await getDevCliValidationOutput(await browser.url(), () =>
        next.cliOutput.slice(outputIndex)
      )
    ).toMatchInlineSnapshot(`
     "Error: Route "/shared": Next.js encountered uncached data during prerendering.

     \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

     Ways to fix this:
       - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
       - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
       - [block] Set \`export const instant = false\` to allow a blocking route

     Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
         at readValue (app/shared/read-value.ts:7:19)
         at SharedPage (app/shared/page.tsx:4:29)
        5 |   // server runs, so the update lands in a module the page imports.
        6 |
     >  7 |   await connection()
          |                   ^
        8 |
        9 |   return 'shared'
       10 | }"
    `)
  })

  it("symbolicates a route that another route's update did not touch", async () => {
    // Validate the neighbour first, so the thread that validates holds its
    // module state, then update it. The route asserted below shares that
    // thread, and reports the same frames as it did before the update.
    const neighbor = await next.browser('/neighbor')
    await getDevCliValidationOutput(await neighbor.url(), () => next.cliOutput)

    await next.patchFile('app/neighbor/page.tsx', (content) =>
      content.replace('<p>neighbor</p>', '<p>neighbor edited</p>')
    )

    await retry(async () => {
      expect(await neighbor.elementByCss('p').text()).toBe('neighbor edited')
    })

    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/static')

    expect(
      await getDevCliValidationOutput(await browser.url(), () =>
        next.cliOutput.slice(outputIndex)
      )
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
