import { nextTestSetup } from 'e2e-utils'

// `__turbopack_chunks__` is a Turbopack-only feature.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-chunks',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      // Local `file:` dependency (cond-pkg) needs install.
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('works', async () => {
      const response = JSON.parse(await next.render('/api'))
      expect(response).toEqual({
        random: 0.1234,
        b: 'hello world',
      })
    })
  }
)
