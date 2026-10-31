import { nextTestSetup } from 'e2e-utils'

describe('Handles valid/invalid assetPrefix', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should not error without usage of assetPrefix', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
    }`
    )

    const { cliOutput } = await next.build()
    expect(cliOutput).not.toMatch(/Specified assetPrefix is not a string/)
  })

  it('should not error when assetPrefix is a string', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
      assetPrefix: '/hello'
    }`
    )

    const { cliOutput } = await next.build()
    expect(cliOutput).not.toMatch(/Specified assetPrefix is not a string/)
  })
})
