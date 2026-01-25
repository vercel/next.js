import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-type-error-esm', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    packageJson: {
      type: 'module',
    },
  })

  if (skipped) {
    return
  }

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
