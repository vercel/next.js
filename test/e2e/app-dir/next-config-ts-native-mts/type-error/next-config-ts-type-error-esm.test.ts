import { isNextDeploy, nextTestSetup } from 'e2e-utils'

describe('next-config-ts-type-error-esm', () => {
  // Deploy builds use the fixture's Node version, not the test runner's.
  // TODO: Remove this local check once we bump minimum Node.js version to v22
  if (!isNextDeploy && !(process.features as any).typescript) {
    it.skip('requires `process.features.typescript` to feature detect Node.js native TS', () => {})
    return
  }

  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    packageJson: {
      ...(isNextDeploy ? { engines: { node: '22.x' } } : {}),
      type: 'module',
    },
  })

  it('should throw with type error on build (ESM)', async () => {
    if (isNextDev) {
      await next.start()
      const $ = await next.render$('/')
      expect($('p').text()).toBe('foo')
    } else {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(
        `Type 'string' is not assignable to type 'number'.`
      )
    }
  }, 240_000)
})
