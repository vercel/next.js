import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-tsconfig-extends-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support tsconfig extends (CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
