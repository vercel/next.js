import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'with-exported-function-config',
  {
    files: __dirname,
  },
  ({ next, isNextStart }) => {
    if (isNextStart) {
      it('should have correct values in function config manifest', async () => {
        const functionsConfigManifest = JSON.parse(
          await next.readFile('.next/server/functions-config-manifest.json')
        )

        expect(functionsConfigManifest).toMatchInlineSnapshot(`
          Object {
            "/": Object {
              "maxDuration": 5,
            },
            "/foo/bar": Object {
              "maxDuration": 2,
            },
          }
        `)
      })
    }
  }
)
