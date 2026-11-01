import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'babel-next-image',
  () => {
    const { next } = nextTestSetup({ files: __dirname })

    it('should work with babel and next/image', async () => {
      if (
        await gate(
          (conditions) =>
            conditions.futureCompat && conditions.dev && conditions.rspack
        )
      ) {
        await expect(next.fetch('/')).rejects.toThrow('fetch failed')
        await retry(() => {
          expect(next.cliOutput).toContain('DEP0111')
          expect(next.cliOutput).toContain('process.binding()')
        })
        return
      }
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
    })
  }
)
