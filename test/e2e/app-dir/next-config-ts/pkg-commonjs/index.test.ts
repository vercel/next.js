import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-pkg-commonjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle ESM modules in CommonJS project', async () => {
    const $ = await next.render$('/')
    const text = $('p').text()
    expect(text).toContain('cjs')
    expect(text).toContain('mjs')
    expect(text).toContain('cts')
    expect(text).toContain('mts')
    expect(text).toContain('ts')
    expect(text).toContain('commonjs')
  })
})
