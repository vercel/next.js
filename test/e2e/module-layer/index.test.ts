import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'module layer',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
    it('should render routes marked with restriction marks without errors', async () => {
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
      ]

      for (const route of routes) {
        const { status } = await next.fetch(route)
        expect([route, status]).toEqual([route, 200])
      }
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
)
