import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('Nullish configs in next.config.js', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should ignore configs set to `undefined` in next.config.js', async () => {
    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        target: undefined,
        env: undefined,
        webpack: undefined,
        pageExtensions: undefined,
      }
    `
    )

    const html = await next.render('/')
    expect(html).toContain('Hello World')

    if (isNextDev) {
      expect(next.cliOutput).toMatch(/ready/i)
    } else {
      expect(next.cliOutput).toMatch(/Compiled successfully/i)
    }
  })

  it('should ignore configs set to `null` in next.config.js', async () => {
    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        target: null,
        env: null,
        webpack: null,
        pageExtensions: null,
      }
    `
    )

    const html = await next.render('/')
    expect(html).toContain('Hello World')

    if (isNextDev) {
      expect(next.cliOutput).toMatch(/ready/i)
    } else {
      expect(next.cliOutput).toMatch(/Compiled successfully/i)
    }
  })
})
