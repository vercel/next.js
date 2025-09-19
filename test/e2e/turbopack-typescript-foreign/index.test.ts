import { nextTestSetup } from 'e2e-utils'

// Not supported by Webpack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-typescript-foreign',
  () => {
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

        expect(next.cliOutput).toContain(`pkg/index.ts
Unknown module type
This module doesn't have an associated type`)
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
  }
)
