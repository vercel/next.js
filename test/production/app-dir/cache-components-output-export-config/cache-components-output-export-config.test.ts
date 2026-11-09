import { nextTestSetup } from 'e2e-utils'
import type { NextConfig } from 'next'

describe('cache-components-output-export-config', () => {
  describe.each<{ name: string; config: NextConfig }>([
    ...[undefined, false, true].map((partialPrefetching) => ({
      name: `with Cache Components and partialPrefetching=${partialPrefetching}`,
      config: { cacheComponents: true, partialPrefetching },
    })),
    {
      name: 'with legacy Cache Components enabled',
      config: {
        partialPrefetching: false,
        experimental: { cacheComponents: true, cachedNavigations: false },
      },
    },
    {
      name: 'with legacy true overriding top-level false',
      config: {
        cacheComponents: false,
        partialPrefetching: false,
        experimental: { cacheComponents: true, cachedNavigations: false },
      },
    },
  ])('$name', ({ config }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        output: 'export',
        ...config,
      },
      skipStart: true,
    })

    it('rejects the config before compiling or writing an export', async () => {
      const { exitCode, cliOutput } = await next.build()

      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        "`cacheComponents` is not yet supported with `output: 'export'`."
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
  })

  describe.each<{ name: string; config: NextConfig }>([
    {
      name: 'without Cache Components',
      config: { cacheComponents: false },
    },
    {
      name: 'with legacy false overriding top-level true',
      config: {
        cacheComponents: true,
        experimental: { cacheComponents: false },
      },
    },
  ])('$name', ({ config }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        ...config,
        output: 'export',
        partialPrefetching: false,
        experimental: {
          ...config.experimental,
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
