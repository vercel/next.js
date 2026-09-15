import { nextTestSetup } from 'e2e-utils'

// Only implemented in Webpack
// Fixture uses force-dynamic which doesn't work with cache components enabled
;(process.env.IS_TURBOPACK_TEST && !process.env.__NEXT_CACHE_COMPONENTS
  ? describe
  : describe.skip)('turbopack-emit-collect', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  function formatId(id: string) {
    return id.slice(id.lastIndexOf('/src/') + 5).replace(' (ecmascript)', '')
  }

  function formatData(data: { id: string; data: string; import: any }[]) {
    // The data should be in a deterministic order, but the order in dev is not guaranteed to be the
    // same as in prod, so we sort it before matching the snapshot.
    return [...data]
      .sort(
        (a, b) =>
          a.id.localeCompare(b.id) ||
          JSON.stringify(a.data).localeCompare(JSON.stringify(b.data))
      )
      .map(
        ({ id, data, import: i }) =>
          `${formatId(id).padEnd(50)}: ${JSON.stringify(data)} ==> ${JSON.stringify(i)}`
      )
  }

  /**
   * The ids of all fixture modules that are installed in the runtime, i.e.
   * that were actually chunked into the entry serving the request.
   *
   * This is what catches emitted modules that are silently chunked without
   * showing up in the collect list, in particular modules that are scoped to
   * a different page's entry.
   */
  function formatModules(modules: string[]) {
    return [...new Set(modules)]
      .filter(
        (id) =>
          id.startsWith('[project]/src/') ||
          id.startsWith('[project]/test/e2e/turbopack-emit-collect/')
      )
      .filter((id) => !id.includes('/page.js ') && !id.includes('/layout.js '))
      .sort()
  }

  function expectModuleNotLoaded(modules: string[], id: string) {
    expect(modules).not.toEqual(
      expect.arrayContaining([expect.stringContaining(id)])
    )
  }

  /**
   * Restarts the server so that `__turbopack_modules__` only contains the
   * modules of the entry serving `route`, then requests it exactly once.
   *
   * The module map is process-global and is never pruned, so without the
   * restart it would accumulate the modules of every previously rendered
   * route and would not say anything about this entry.
   *
   * `html: false` is for the routes that respond with JSON directly instead
   * of rendering it into `<code id="list">`.
   */
  async function getResult(route: string, { html = true } = {}) {
    await next.stop()
    await next.start({ skipBuild: true })

    const response = html
      ? JSON.parse((await next.render$(route))('#list').text())
      : JSON.parse(await next.render(route))

    return {
      list: formatData(response.list),
      modules: formatModules(response.modules),
    }
  }

  it('works for /client/a', async () => {
    const { list, modules } = await getResult('/client/a')

    // The sibling page's entry-scoped emit must not be chunked here.
    expectModuleNotLoaded(modules, 'app/client/b/unique.js')

    if (isNextDev) {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/a/unique.js [app-client]               : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/a/unique.js [app-ssr]                  : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/a/lib.js [app-rsc] (client reference proxy)",
           "[project]/src/app/client/a/lib.js [app-rsc] (client reference proxy) <module evaluation>",
           "[project]/src/app/client/a/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/client/a/unique.js [app-client] (ecmascript)",
           "[project]/src/app/client/a/unique.js [app-ssr] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/a/unique.js [app-client]               : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/a/unique.js [app-ssr]                  : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/a/lib.js [app-rsc] (client reference proxy)",
           "[project]/src/app/client/a/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/client/a/unique.js [app-client] (ecmascript)",
           "[project]/src/app/client/a/unique.js [app-ssr] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /client/b', async () => {
    const { list, modules } = await getResult('/client/b')

    expectModuleNotLoaded(modules, 'app/client/a/unique.js')

    if (isNextDev) {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/b/unique.js [app-client]               : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/b/unique.js [app-ssr]                  : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/b/lib.js [app-rsc] (client reference proxy)",
           "[project]/src/app/client/b/lib.js [app-rsc] (client reference proxy) <module evaluation>",
           "[project]/src/app/client/b/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/client/b/unique.js [app-client] (ecmascript)",
           "[project]/src/app/client/b/unique.js [app-ssr] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/b/unique.js [app-client]               : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/b/unique.js [app-ssr]                  : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/b/lib.js [app-rsc] (client reference proxy)",
           "[project]/src/app/client/b/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/client/b/unique.js [app-client] (ecmascript)",
           "[project]/src/app/client/b/unique.js [app-ssr] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /rsc/a', async () => {
    const { list, modules } = await getResult('/rsc/a')

    expectModuleNotLoaded(modules, 'app/rsc/b/unique.js')

    if (isNextDev) {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/a/unique.js [app-rsc]                     : "data-for-unique-rsc-a" ==> "unique /rsc/a"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/a/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/a/unique.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/a/unique.js [app-rsc]                     : "data-for-unique-rsc-a" ==> "unique /rsc/a"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/a/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/a/unique.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /rsc/b', async () => {
    const { list, modules } = await getResult('/rsc/b')

    expectModuleNotLoaded(modules, 'app/rsc/a/unique.js')

    if (isNextDev) {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/b/unique.js [app-rsc]                     : "data-for-unique-rsc-b" ==> "unique /rsc/b"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/b/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/b/unique.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/b/unique.js [app-rsc]                     : "data-for-unique-rsc-b" ==> "unique /rsc/b"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/b/lib.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/b/unique.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /rsc/c', async () => {
    const { list, modules } = await getResult('/rsc/c')

    // `app/rsc/c/lib.js` emits but is never imported by the page, so it must
    // not be pulled into the graph.
    expectModuleNotLoaded(modules, 'app/rsc/c/lib.js')

    if (isNextDev) {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/layout-target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/index.js [app-rsc] (ecmascript)",
           "[project]/src/app/rsc/shared-page/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [app-rsc] (ecmascript)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /pages/a', async () => {
    const { list, modules } = await getResult('/pages/a')

    expectModuleNotLoaded(modules, 'pages-lib/client-only/unique.js')

    if (isNextDev) {
      // TODO this is currently missing because of the split Pages Router module graph
      // "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
      expect(list).toMatchInlineSnapshot(`
         [
           "pages-lib/a/unique.js [ssr]                       : "data-for-unique-pages-a" ==> "unique /pages/a"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/collect-result.js [ssr] (ecmascript)",
           "[project]/src/pages-lib/a/lib.js [ssr] (ecmascript)",
           "[project]/src/pages-lib/a/unique.js [ssr] (ecmascript)",
           "[project]/src/pages/pages/a.js [ssr] (ecmascript)",
           "[project]/src/pages/pages/a.js [ssr] (ecmascript, collect, my-test)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "pages-lib/a/unique.js [ssr]                       : "data-for-unique-pages-a" ==> "unique /pages/a"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [ssr] (ecmascript)",
           "[project]/src/pages-lib/a/lib.js [ssr] (ecmascript)",
           "[project]/src/pages-lib/a/unique.js [ssr] (ecmascript)",
           "[project]/src/pages/pages/a.js [ssr] (ecmascript, collect, my-test)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /pages/client-only', async () => {
    const { list, modules } = await getResult('/pages/client-only')

    expectModuleNotLoaded(modules, 'pages-lib/a/unique.js')

    if (isNextDev) {
      // TODO this is currently missing because of the split Pages Router module graph
      // "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
      expect(list).toMatchInlineSnapshot(`
         [
           "pages-lib/client-only/unique.js [ssr]             : "data-for-unique-pages-client-only" ==> "unique /pages/client-only"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/collect-result.js [ssr] (ecmascript)",
           "[project]/src/pages-lib/client-only/lib.js [ssr] (ecmascript, next/dynamic entry, async loader)",
           "[project]/src/pages-lib/client-only/unique.js [ssr] (ecmascript)",
           "[project]/src/pages/pages/client-only.js [ssr] (ecmascript)",
           "[project]/src/pages/pages/client-only.js [ssr] (ecmascript, collect, my-test)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "pages-lib/client-only/unique.js [ssr]             : "data-for-unique-pages-client-only" ==> "unique /pages/client-only"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/collect-result.js [ssr] (ecmascript)",
           "[project]/src/pages-lib/client-only/lib.js [ssr] (ecmascript, next/dynamic entry, async loader)",
           "[project]/src/pages-lib/client-only/unique.js [ssr] (ecmascript)",
           "[project]/src/pages/pages/client-only.js [ssr] (ecmascript, collect, my-test)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /api', async () => {
    const { list, modules } = await getResult('/api', { html: false })

    expectModuleNotLoaded(modules, 'app/rsc/a/unique.js')

    if (isNextDev) {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/api/unique.js [app-route]                     : "data-for-unique-api" ==> "unique api"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/api/lib.js [app-route] (ecmascript)",
           "[project]/src/app/api/route.js [app-route] (ecmascript)",
           "[project]/src/app/api/route.js [app-route] (ecmascript, collect, my-test)",
           "[project]/src/app/api/unique.js [app-route] (ecmascript)",
           "[project]/src/collect-result.js [app-route] (ecmascript)",
           "[project]/src/collect-result.js [middleware] (ecmascript)",
           "[project]/src/proxy.js [middleware] (ecmascript)",
           "[project]/src/proxy.js [middleware] (ecmascript, collect, my-test)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/api/unique.js [app-route]                     : "data-for-unique-api" ==> "unique api"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/api/lib.js [app-route] (ecmascript)",
           "[project]/src/app/api/route.js [app-route] (ecmascript)",
           "[project]/src/app/api/route.js [app-route] (ecmascript, collect, my-test)",
           "[project]/src/app/api/unique.js [app-route] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/proxy.js [middleware] (ecmascript, collect, my-test)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })

  it('works for /proxy', async () => {
    const { list, modules } = await getResult('/proxy', { html: false })

    if (isNextDev) {
      expect(list).toMatchInlineSnapshot(`[]`)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/collect-result.js [middleware] (ecmascript)",
           "[project]/src/proxy.js [middleware] (ecmascript)",
           "[project]/src/proxy.js [middleware] (ecmascript, collect, my-test)",
         ]
        `)
    } else {
      expect(list).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [client]                   : "data-for-shared-pages-client-only" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-a" ==> "shared pages client"",
           "shared-pages-client.js [ssr]                      : "data-for-shared-pages-client-only" ==> "shared pages client"",
         ]
        `)
      expect(modules).toMatchInlineSnapshot(`
         [
           "[project]/src/app/client/shared-app-client.js [app-client] (ecmascript)",
           "[project]/src/app/client/shared-app-client.js [app-ssr] (ecmascript)",
           "[project]/src/app/rsc/shared-app/target.js [app-rsc] (ecmascript)",
           "[project]/src/proxy.js [middleware] (ecmascript, collect, my-test)",
           "[project]/src/shared-pages-client.js [client] (ecmascript)",
           "[project]/src/shared-pages-client.js [ssr] (ecmascript)",
         ]
        `)
    }
  })
})
