import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-export-as-default-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support export as default (CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
