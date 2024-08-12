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
          // TODO: remove this comment.
          // The `maxDuration` for `/app-layout/inner` is present, but `/app-layout` is not.
          // This occurs because the `maxDuration` defined in `layout.tsx` is not overridden
          // at `/app-layout`, and `/app-layout/inner` has it's own `maxDuration` defined just
          // like other routes.
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

      // TODO: remove the test below, it is to show the current behavior
      expect(functionsConfigManifest.functions).not.toHaveProperty(
        '/app-layout'
      )
    }
  })
})
