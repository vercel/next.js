import { nextTestSetup } from 'e2e-utils'

describe('expire-time-infinity', () => {
  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    it.skip('the route segment config is not compatible with cacheComponents', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('serves a well-formed cache-control header for an Infinity expireTime', async () => {
    await next.start()

    try {
      const res = await next.fetch('/')
      const cacheControl = res.headers.get('cache-control')

      // The stale-while-revalidate window is derived from the expireTime. An
      // Infinity expireTime must resolve to a finite window instead of the
      // invalid `stale-while-revalidate=Infinity`.
      expect(cacheControl).toMatch(/s-maxage=60, stale-while-revalidate=\d+$/)
    } finally {
      await next.stop()
    }
  })

  it('fails the build for a non-finite expireTime other than Infinity', async () => {
    await next.patchFile('next.config.js', (config) =>
      config.replace('expireTime: Infinity', 'expireTime: -Infinity')
    )

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain(
      'Invalid "expireTime" provided, expected a finite number of seconds or Infinity, received -Infinity'
    )
  })

  it('fails the build for a non-finite staleTime other than Infinity', async () => {
    await next.patchFile('next.config.js', (config) =>
      config
        .replace('expireTime: -Infinity', 'expireTime: Infinity')
        .replace('dynamic: Infinity', 'dynamic: NaN')
    )

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain(
      'Invalid "experimental.staleTimes.dynamic" provided, expected a finite number of seconds or Infinity, received NaN'
    )
  })
})
