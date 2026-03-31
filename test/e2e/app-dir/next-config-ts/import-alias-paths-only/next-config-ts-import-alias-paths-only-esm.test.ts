import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-alias-paths-only-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should support import alias paths only (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
