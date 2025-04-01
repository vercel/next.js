import { nextTestSetup } from 'e2e-utils'
;(process.env.TURBOPACK ? describe : describe.skip)(
  'turbopack-build-marker',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should have Turbopack build marker', async () => {
      expect(await next.hasFile('.next/IS_TURBOPACK_BUILD')).toBe(true)
    })
  }
)
