import { nextTestSetup } from 'e2e-utils'

describe('Nullish configs in next.config.js', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should ignore configs set to `undefined` in next.config.js', async () => {
    const html = await next.render('/')
    expect(html).toContain('Hello World')
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
  })
})
