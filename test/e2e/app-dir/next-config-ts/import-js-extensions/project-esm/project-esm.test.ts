import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import js extensions (project ESM)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
    tsconfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
      },
    },
  })

  it('should import js extensions (project ESM)', async () => {
    const $ = await next.render$('/')
    const text = $('p').text()
    expect(text).toContain('jsESM')
    expect(text).toContain('cjs')
    expect(text).toContain('mjs')
    expect(text).toContain('cts')
    expect(text).toContain('mts')
    expect(text).toContain('ts')
  })
})
