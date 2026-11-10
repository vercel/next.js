import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'babel-next-image',
  () => {
    const { next } = nextTestSetup({ files: __dirname })

    it('should work with babel and next/image', async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
    })
  }
)
