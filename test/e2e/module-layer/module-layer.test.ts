import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource, retry } from 'next-test-utils'

describe('module layer', () => {
  const { next, isNextStart, isNextDev } = nextTestSetup({
    files: __dirname,
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
      '/api/default',
      '/api/default-edge',
      '/api/server-only',
      '/api/server-only-edge',
      '/api/mixed',
    ]

    for (const route of routes) {
      it(`should render routes marked with restriction marks without errors ${route}`, async () => {
        const { status } = await next.fetch(route)
        expect([route, status]).toEqual([route, 200])
      })
    }

    it('should render installed react-server condition for middleware', async () => {
      const json = await next.fetch('/middleware').then((res) => res.json())
      expect(json.React).toContain('version') // basic react-server export
      expect(json.React).not.toContain('useEffect') // no client api export
    })

    // This is for backward compatibility, don't change react usage in existing pages/api
    it('should contain client react exports for pages api', async () => {
      async function verifyReactExports(route, isEdge) {
        const json = await next.fetch(route).then((res) => res.json())
        // contain all react-server and default condition exports
        expect(json.React).toContain('version')
        expect(json.React).toContain('useEffect')

        // contain react-dom-server default condition exports
        expect(json.ReactDomServer).toContain('version')
        expect(json.ReactDomServer).toContain('renderToString')
        expect(json.ReactDomServer).toContain('renderToStaticMarkup')
        expect(json.ReactDomServer).toContain(
          isEdge ? 'renderToReadableStream' : 'renderToPipeableStream'
        )
      }

      await verifyReactExports('/api/default', false)
      await verifyReactExports('/api/default-edge', true)
      await verifyReactExports('/api/server-only', false)
      await verifyReactExports('/api/server-only-edge', true)
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
          '/api/default-edge',
          '/api/server-only-edge',
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
          '/api/default-edge',
          '/pages-ssr',
          '/api/default',
          '/api/server-only',
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
          await assertHasRedbox(browser)
          const source = await getRedboxSource(browser)
          expect(source).toContain(
            `You're importing a component that imports client-only. It only works in a Client Component but none of its parents are marked with "use client"`
          )
        })
      })
    })
  }

  describe('with server-only in server targets', () => {
    runTests()
  })
})
