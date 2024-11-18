import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import js extensions (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    tsconfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
      },
    },
  })

  beforeAll(async () => {
    await next.patchFile('next.config.ts', (content) => {
      // uncomment jsCJS (.js extension as Commonjs syntax)
      return content
        .replace(
          `// import js from './fixtures/js-cjs'`,
          `import js from './fixtures/js-cjs'`
        )
        .replace(`// js,`, `js,`)
    })
    await next.renameFile('next.config.ts', 'next.config.mts')
    await next.start()
  })

  it('should import js extensions (next.config.mts)', async () => {
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
