import { nextTestSetup } from 'e2e-utils'

// vercel.json uses pnpm so file: dependencies are installed inside node_modules.
// npm links them to fixture source, which is transpiled without transpilePackages.
describe('transpile-packages-typescript-foreign', () => {
  // The build only fails because Vercel reads vercel.json's
  // `installCommand: "pnpm install"`, which copies the `file:` package into
  // node_modules. A host that ignores vercel.json may link it instead, and
  // the build would then succeed.
  // @force-gate !deploy || vercel
  describe('without transpilePackages', () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      // Use the fixture's packageManager version rather than Vercel's default pnpm.
      env: { ENABLE_EXPERIMENTAL_COREPACK: '1' },
      dependencies: {
        pkg: `file:./pkg`,
      },
    })

    it('should fail', async () => {
      if (isNextDev) {
        try {
          await next.start()
          await next.render('/')
        } catch {}
      } else {
        await expect(next.start()).rejects.toThrow()
      }

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
    }, 240_000)
  })

  describe('with transpilePackages', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: { ENABLE_EXPERIMENTAL_COREPACK: '1' },
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
