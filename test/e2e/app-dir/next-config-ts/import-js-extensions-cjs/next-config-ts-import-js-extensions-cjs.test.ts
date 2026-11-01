import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('next-config-ts-import-js-extensions-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should import js extensions (CJS)', async () => {
    const $ = await next.render$('/')
    const text = $('p').text()
    expect(text).toContain('jsCJS')
    expect(text).toContain('cjs')
    expect(text).toContain('mjs')
    expect(text).toContain('cts')
    expect(text).toContain('mts')
    expect(text).toContain('ts')
  })
})
