import { nextTestSetup } from 'e2e-utils'

// This suite runs next.build() to inspect build output or errors.
// Deploy mode requires a successful deployment and cannot run these local builds.
// @force-gate !deploy
describe('next-config-ts-type-error-cjs', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should throw with type error on build (CJS)', async () => {
    if (isNextDev) {
      await next.start()
      const $ = await next.render$('/')
      expect($('p').text()).toBe('foo')
    } else {
      const { cliOutput } = await next.build()
      await expect(cliOutput).toContain(
        `Type 'string' is not assignable to type 'number'.`
      )
    }
  })
})
