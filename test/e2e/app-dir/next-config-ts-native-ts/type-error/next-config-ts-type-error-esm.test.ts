import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('next-config-ts-type-error-esm', () => {
  // TODO: Remove this once we bump minimum Node.js version to v22
  if (!(process.features as any).typescript) {
    it.skip('requires `process.features.typescript` to feature detect Node.js native TS', () => {})
    return
  }

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
