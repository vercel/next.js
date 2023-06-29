import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'with-exported-function-config',
  {
    files: __dirname,
  },
  ({ next, isNextStart }) => {
    it('should have correct values in function config manifest', async () => {
      if (isNextStart) {
        const functionsConfigManifest = JSON.parse(
          await next.readFile('.next/server/functions-config-manifest.json')
        )

        expect(functionsConfigManifest).toMatchInlineSnapshot(`
          Object {
            "/api/page-route": Object {
              "maxDuration": 1,
            },
            "/app-route": Object {
              "maxDuration": 1,
            },
            "/app-route-edge": Object {
              "maxDuration": 2,
            },
            "/app-ssr": Object {
              "maxDuration": 3,
            },
            "/app-ssr-edge": Object {
              "maxDuration": 4,
            },
            "/page": Object {
              "maxDuration": 2,
            },
            "/page-ssr": Object {
              "maxDuration": 3,
            },
          }
        `)
      }
    })
  }
)
