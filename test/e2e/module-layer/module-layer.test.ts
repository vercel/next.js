import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource, hasRedbox, retry } from 'next-test-utils'

describe('module layer', () => {
  const { next, isNextStart, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    dependencies: {
      react: '19.0.0-rc-915b914b3a-20240515',
      'react-dom': '19.0.0-rc-915b914b3a-20240515',
    },
  })

  function runTests() {
    const routes = [
      // app client components pages
      '/app/client',
      '/app/client-edge',
      // app sever components pages
      '/app/server',
      '/app/server-edge',
      // app routes
      '/app/route',
      '/app/route-edge',
      // pages/api
      '/api/hello',
      '/api/hello-edge',
      '/api/mixed',
    ]

    for (const route of routes) {
      it(`should render routes marked with restriction marks without errors ${route}`, async () => {
        const { status } = await next.fetch(route)
        expect([route, status]).toEqual([route, 200])
      })
    }

    it('should render installed react version for middleware', async () => {
      const text = await next.fetch('/react-version').then((res) => res.text())
      expect(text).toContain('19.0.0-rc')
    })

    if (isNextStart) {
      it('should log the build info properly', async () => {
        const cliOutput = next.cliOutput
        expect(cliOutput).toContain('Middleware')

        const functionsManifest = JSON.parse(
          await next.readFile('.next/server/functions-config-manifest.json')
        )
        expect(functionsManifest.functions).toContainKeys([
          '/app/route-edge',
          '/api/hello-edge',
          '/app/client-edge',
          '/app/server-edge',
        ])
        const pagesManifest = JSON.parse(
          await next.readFile('.next/server/pages-manifest.json')
        )
        const middlewareManifest = JSON.parse(
          await next.readFile('.next/server/middleware-manifest.json')
        )
        expect(middlewareManifest.middleware).toBeTruthy()
        expect(pagesManifest).toContainKeys([
          '/api/hello-edge',
          '/pages-ssr',
          '/api/hello',
        ])
      })
    }
  }

  if (isNextDev) {
    describe('client packages in middleware', () => {
      const middlewareFile = 'middleware.js'
      let middlewareContent = ''

      afterAll(async () => {
        await next.patchFile(middlewareFile, middlewareContent)
      })

      it('should error when import server packages in middleware', async () => {
        const browser = await next.browser('/')

        middlewareContent = await next.readFile(middlewareFile)

        await next.patchFile(
          middlewareFile,
          middlewareContent
            .replace("import 'server-only'", "// import 'server-only'")
            .replace("// import './lib/mixed-lib'", "import './lib/mixed-lib'")
        )

        await retry(async () => {
          expect(await hasRedbox(browser)).toBe(true)
          const source = await getRedboxSource(browser)
          expect(source).toContain(
            isTurbopack
              ? `'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component.`
              : `You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client"`
          )
        })
      })
    })
  }

  describe('with server-only in server targets', () => {
    runTests()
  })
})
