import { nextTestSetup } from 'e2e-utils'

// Not supported by Webpack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-import-type-bytes',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('support import type: bytes', async () => {
      const response = JSON.parse(await next.render('/api'))
      expect(response).toEqual({
        instanceofUint8Array: true,
        length: 18,
        content: 'this is some data\n',
      })
    })
  }
)
