import { nextTestSetup } from 'e2e-utils'

describe('no-mangling', () => {
  describe('with the default `next build`', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should show mangled function names in stack traces', async () => {
      try {
        await next.build()
      } catch {
        // we expect the build to fail
      }

      expect(next.cliOutput).toInclude(`
Error: Kaputt!
    at `) // mangled function name omitted because it's undeterministic

      // `Page` is the original function name that is mangled because `next
      // build` was called without `--no-mangling`.
      expect(next.cliOutput).not.toInclude(`
Error: Kaputt!
    at Page`)
    })
  })

  describe('with `next build --no-mangling`', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      buildArgs: ['--no-mangling'],
      skipStart: true,
    })

    it('should show original function names in stack traces', async () => {
      try {
        await next.build()
      } catch {
        // we expect the build to fail
      }

      // `Page` is the original function name that would be mangled if `next
      // build` was called without `--no-mangling`.
      expect(next.cliOutput).toInclude(`
Error: Kaputt!
    at Page`)
    })

    describe('with "use cache" functions', () => {
      it('should show original function names in stack traces', async () => {
        try {
          await next.build()
        } catch {
          // we expect the build to fail
        }

        // `CachedPage` is the original function name that would be mangled if
        // `next build` was called without `--no-mangling`.
        expect(next.cliOutput).toInclude(`
Error: Kaputt!
    at CachedPage`)
      })
    })
  })
})
