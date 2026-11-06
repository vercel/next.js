import { nextTestSetup } from 'e2e-utils'

describe('cache-components-output-export-config', () => {
  describe.each([undefined, false, true])(
    'with Cache Components and partialPrefetching=%s',
    (partialPrefetching) => {
      const { next } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          output: 'export',
          cacheComponents: true,
          partialPrefetching,
        },
        skipStart: true,
      })

      it('rejects the config before compiling or writing an export', async () => {
        const { exitCode, cliOutput } = await next.build()

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(
          "`cacheComponents` is not currently supported with `output: 'export'`."
        )
        expect(cliOutput).toContain(
          "Remove `output: 'export'`, or disable `cacheComponents` and `partialPrefetching` to generate a static export."
        )
        expect(cliOutput).toContain(
          'https://nextjs.org/docs/app/guides/static-exports#unsupported-features'
        )
        expect(await next.hasFile('.next/server')).toBe(false)
        expect(await next.hasFile('out')).toBe(false)
      })
    }
  )

  describe('without Cache Components', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        output: 'export',
        cacheComponents: false,
        partialPrefetching: false,
        experimental: {
          cachedNavigations: false,
        },
      },
      skipStart: true,
    })

    it('exports the static page', async () => {
      const { exitCode } = await next.build()

      expect(exitCode).toBe(0)
      expect(await next.readFile('out/index.html')).toContain('hello world')
    })
  })
})
