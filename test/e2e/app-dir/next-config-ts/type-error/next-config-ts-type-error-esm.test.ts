import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('next-config-ts-type-error-esm', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    packageJson: {
      type: 'module',
    },
  })

  it('should throw with type error on build (ESM)', async () => {
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
