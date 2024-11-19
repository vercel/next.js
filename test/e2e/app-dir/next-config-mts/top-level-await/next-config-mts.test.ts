import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - top-level await (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support top-level await (next.config.mts)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
