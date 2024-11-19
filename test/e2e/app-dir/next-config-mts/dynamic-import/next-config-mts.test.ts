import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - dynamic import (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support dynamic import (next.config.mts)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
