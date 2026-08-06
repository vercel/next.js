import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'next-config-ts - turbopack',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      // explicitly ensure that turbopack is used
      startCommand: 'pnpm next dev --turbopack',
    })
    it('should work with Turbopack', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('foo')
    })
  }
)
