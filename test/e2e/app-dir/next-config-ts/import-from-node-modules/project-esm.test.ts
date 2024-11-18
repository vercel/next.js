import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - import from node_modules (project ESM)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should import from node_modules (project ESM)', async () => {
    const $ = await next.render$('/')
    const text = $('p').text()
    expect(text).toContain('cjs')
    expect(text).toContain('mjs')
    expect(text).toContain('jsCJS')
    expect(text).toContain('jsESM')
  })
})
