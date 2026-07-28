import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'experimental decorators',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should support stage 3 decorators', async () => {
      const response = await next.fetch('/api/hello')

      await expect(response.json()).resolves.toEqual({
        text: 'hello world',
      })
    })
  }
)
