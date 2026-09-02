import { nextTestSetup } from 'e2e-utils'

describe('transpile-packages-typescript-foreign', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely asserts local CLI or runtime output that deploy tests do not expose.
  // @force-gate !deploy
  describe('without transpilePackages', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      dependencies: {
        pkg: `file:./pkg`,
      },
    })

    it('should fail', async () => {
      try {
        await next.start()
        await next.render('/')
      } catch (e) {}

      if (process.env.IS_TURBOPACK_TEST) {
        expect(next.cliOutput).toContain(`pkg/index.ts
Error: Unknown module type
This module doesn't have an associated type`)
        expect(
          next.cliOutput.match(/Unknown module type/g).length
        ).toBeLessThanOrEqual(1)
        expect(next.cliOutput.match(/Missing module type/g)?.length ?? 0).toBe(
          0
        )
      } else {
        expect(next.cliOutput).toContain(`pkg/index.ts
Module parse failed: Unexpected token`)
      }
    })
  })

  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely asserts local CLI or runtime output that deploy tests do not expose.
  // @force-gate !deploy
  describe('with transpilePackages', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        pkg: `file:./pkg`,
      },
      nextConfig: {
        transpilePackages: ['pkg'],
      },
    })

    it('should work', async () => {
      const $ = await next.render$('/')
      expect($('main').text()).toEqual('Hello 123')
    })
  })
})
