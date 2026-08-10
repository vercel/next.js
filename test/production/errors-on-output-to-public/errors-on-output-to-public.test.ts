import { nextTestSetup } from 'e2e-utils'

describe('Errors on output to public', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('Throws error when `distDir` is set to public', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'public' }`
    )
    await next.build()

    expect(next.cliOutput).toMatch(
      /The 'public' directory is reserved in Next\.js and can not be set as/
    )
  })

  it('Throws error when export out dir is public', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'public', output: 'export' }`
    )
    await next.build()

    expect(next.cliOutput).toMatch(
      /The 'public' directory is reserved in Next\.js and can not be/
    )
  })
})
