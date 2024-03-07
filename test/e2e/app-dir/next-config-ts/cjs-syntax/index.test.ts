import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-cjs-syntax', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support CJS syntax', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
