import { nextTestSetup } from 'e2e-utils'

describe('pkg-type-module-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support ESM project package.json type module', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobarbaz')
  })
})
