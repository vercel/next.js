import { nextTestSetup } from 'e2e-utils'

describe('use-cache-invalid-cache-life', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('fails the build for a config profile with a non-finite value other than Infinity', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        cacheComponents: true,
        cacheLife: {
          invalid: { revalidate: -Infinity },
        },
      }`
    )

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain(
      'Invalid "cacheLife.invalid.revalidate" provided, expected a finite number of seconds or Infinity, received -Infinity'
    )
  })

  it('fails the build for an inline cacheLife() profile with a non-finite value other than Infinity', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        cacheComponents: true,
      }`
    )

    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain(
      'Invalid `cacheLife()` option "expire" provided, expected a finite number of seconds or Infinity, received NaN.'
    )
  })
})
