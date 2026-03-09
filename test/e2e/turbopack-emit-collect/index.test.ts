import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-emit-collect',
  () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
    })

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
            `${id
              .slice(id.lastIndexOf('/src/') + 5)
              .replace(' (ecmascript)', '')
              .padEnd(50)}: ${JSON.stringify(data)} ==> ${JSON.stringify(i)}`
        )
    }

    it('works for /client/a', async () => {
      let $ = await next.render$('/client/a')
      let response = JSON.parse($('#list').text())
      if (isNextDev) {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/a/unique.js [app-client]               : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/a/unique.js [app-ssr]                  : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
         ]
        `)
      } else {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/a/unique.js [app-client]               : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/a/unique.js [app-ssr]                  : "data-for-unique-client-a" ==> "unique /client/a"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
         ]
        `)
      }
    })

    it('works for /client/b', async () => {
      let $ = await next.render$('/client/b')
      let response = JSON.parse($('#list').text())
      if (isNextDev) {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/b/unique.js [app-client]               : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/b/unique.js [app-ssr]                  : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-b" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-b" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
         ]
        `)
      } else {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/b/unique.js [app-client]               : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/b/unique.js [app-ssr]                  : "data-for-unique-client-b" ==> "unique /client/b"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
         ]
        `)
      }
    })

    it('works for /rsc/a', async () => {
      let $ = await next.render$('/rsc/a')
      let response = JSON.parse($('#list').text())
      if (isNextDev) {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/a/unique.js [app-rsc]                     : "data-for-unique-rsc-a" ==> "unique /rsc/a"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      } else {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/a/unique.js [app-rsc]                     : "data-for-unique-rsc-a" ==> "unique /rsc/a"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      }
    })

    it('works for /rsc/b', async () => {
      let $ = await next.render$('/rsc/b')
      let response = JSON.parse($('#list').text())
      if (isNextDev) {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/b/unique.js [app-rsc]                     : "data-for-unique-rsc-b" ==> "unique /rsc/b"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      } else {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/b/unique.js [app-rsc]                     : "data-for-unique-rsc-b" ==> "unique /rsc/b"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      }
    })

    it('works for /rsc/c', async () => {
      let $ = await next.render$('/rsc/c')
      let response = JSON.parse($('#list').text())
      if (isNextDev) {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      } else {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/layout-target.js [app-rsc]                    : "data-for-layout" ==> "layout"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
           "app/rsc/shared-page/target.js [app-rsc]           : "data-for-shared-page" ==> "shared-page"",
         ]
        `)
      }
    })

    it('works for /api', async () => {
      const response = JSON.parse(await next.render('/api'))
      if (isNextDev) {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/api/unique.js [app-route]                     : "data-for-unique-api" ==> "unique api"",
         ]
        `)
      } else {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/api/unique.js [app-route]                     : "data-for-unique-api" ==> "unique api"",
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
         ]
        `)
      }
    })

    it('works for /proxy', async () => {
      const response = JSON.parse(await next.render('/proxy'))
      if (isNextDev) {
        expect(formatData(response)).toMatchInlineSnapshot(`[]`)
      } else {
        expect(formatData(response)).toMatchInlineSnapshot(`
         [
           "app/client/shared-app-client.js [app-client]      : "data-for-shared-app-client-a" ==> "app client"",
           "app/client/shared-app-client.js [app-ssr]         : "data-for-shared-app-client-a" ==> "app client"",
           "app/rsc/shared-app/target.js [app-rsc]            : "data-for-shared-app" ==> "shared-app"",
         ]
        `)
      }
    })
  }
)
