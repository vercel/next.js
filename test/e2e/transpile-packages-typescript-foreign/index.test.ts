import { nextTestSetup } from 'e2e-utils'

describe('transpile-packages-typescript-foreign', () => {
  describe('without transpilePackages', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      skipStart: true,
      dependencies: {
        pkg: `file:./pkg`,
      },
    })

    if (skipped) {
      return
    }

    it('should fail', async () => {
      try {
        await next.start()
        await next.render('/')
      } catch (e) {}

      if (process.env.IS_TURBOPACK_TEST) {
        expect(next.cliOutput).toContain(`pkg/index.ts
Unknown module type
This module doesn't have an associated type`)
        expect(
          next.cliOutput.match(/Unknown module type/g).length
        ).toBeLessThanOrEqual(1)
        expect(
          next.cliOutput.match(/Missing module type/g).length
        ).toBeLessThanOrEqual(1)
      } else {
        expect(next.cliOutput).toContain(`pkg/index.ts
Module parse failed: Unexpected token`)
      }
    })
  })

  describe('with transpilePackages', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      dependencies: {
        pkg: `file:./pkg`,
      },
      nextConfig: {
        transpilePackages: ['pkg'],
      },
    })

    if (skipped) {
      return
    }

    it('should work', async () => {
      const $ = await next.render$('/')
      expect($('main').text()).toEqual('Hello 123')
    })
  })
})
