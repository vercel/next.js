import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - export default (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support export default (next.config.mts)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
