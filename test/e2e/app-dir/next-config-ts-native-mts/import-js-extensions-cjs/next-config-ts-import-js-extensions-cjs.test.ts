import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-js-extensions-cjs', () => {
  // TODO: Remove this once we bump minimum Node.js version to v22
  if (!(process.features as any).typescript) {
    it.skip('requires `process.features.typescript` to feature detect Node.js native TS', () => {})
    return
  }

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
