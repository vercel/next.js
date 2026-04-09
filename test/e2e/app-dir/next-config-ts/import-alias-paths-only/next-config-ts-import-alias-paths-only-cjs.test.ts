import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-alias-paths-only-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support import alias paths only (CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
