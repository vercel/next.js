import { nextTestSetup } from 'e2e-utils'

describe('next-config-mts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle next.config.mts as an ESM module', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
