import { nextTestSetup } from 'e2e-utils'

describe('with-exported-function-config', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should have correct values in function config manifest', async () => {
    if (isNextStart) {
      const functionsConfigManifest = JSON.parse(
        await next.readFile('.next/server/functions-config-manifest.json')
      )

      expect(functionsConfigManifest).toEqual({
        functions: {
          '/api/page-route': {
            maxDuration: 1,
          },
          '/app-layout': {
            maxDuration: 1,
          },
          '/app-layout/inner': {
            maxDuration: 2,
          },
          '/app-route': {
            maxDuration: 1,
          },
          '/app-route-edge': {
            maxDuration: 2,
          },
          '/app-ssr': {
            maxDuration: 3,
          },
          '/app-ssr-edge': {
            maxDuration: 4,
          },
          '/page': {
            maxDuration: 2,
          },
          '/page-ssr': {
            maxDuration: 3,
          },
        },
        version: 1,
      })
    }
  })
})
