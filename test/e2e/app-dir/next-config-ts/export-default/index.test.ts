import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-export-as-default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support export { x as default }', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
