import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - export as default (project CJS)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support export as default (project CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
