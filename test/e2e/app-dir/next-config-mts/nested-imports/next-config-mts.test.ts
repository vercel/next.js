import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - nested imports (next.config.mts)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support nested imports (next.config.mts)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobarbaz')
  })
})
