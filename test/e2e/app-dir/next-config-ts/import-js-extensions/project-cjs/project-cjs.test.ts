import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import js extensions (project CJS)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    tsconfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
      },
    },
  })

  it('should import js extensions (project CJS)', async () => {
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
