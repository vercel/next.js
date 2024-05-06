import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

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

      beforeAll(async () => {
        await next.stop()

        middlewareContent = await next.readFile(middlewareFile)

        await next.patchFile(
          middlewareFile,
          middlewareContent
            .replace("import 'server-only'", "// import 'server-only'")
            .replace("// import './lib/mixed-lib'", "import './lib/mixed-lib'")
        )

        await next.start()
      })
      afterAll(async () => {
        await next.patchFile(middlewareFile, middlewareContent)
      })

      it('should error when import server packages in middleware', async () => {
        const existingCliOutputLength = next.cliOutput.length
        await next.fetch('/')

        const newCliOutput = next.cliOutput.slice(existingCliOutputLength)
        expect(newCliOutput).toContain('./middleware.js')
        expect(newCliOutput).toContain(
          `'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component`
        )
      })
    })

    describe('client packages in pages api', () => {
      const pagesApiFile = 'pages/api/mixed.js'
      let pagesApiContent
      beforeAll(async () => {
        pagesApiContent = await next.readFile(pagesApiFile)
        await next.patchFile(
          pagesApiFile,
          pagesApiContent.replace(
            "// import '../../lib/mixed-lib'",
            "import '../../lib/mixed-lib'"
          )
        )
      })
      afterAll(async () => {
        await next.patchFile(pagesApiFile, pagesApiContent)
      })

      it('should error when import client packages in pages/api', async () => {
        const existingCliOutputLength = next.cliOutput.length
        await retry(async () => {
          await next.fetch('/api/mixed')
          const newCliOutput = next.cliOutput.slice(existingCliOutputLength)
          expect(newCliOutput).toContain('./pages/api/mixed.js')
          expect(newCliOutput).toContain(
            `'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component.`
          )
        })
      })
    })
  }

  describe('with server-only in server targets', () => {
    runTests()
  })
})
