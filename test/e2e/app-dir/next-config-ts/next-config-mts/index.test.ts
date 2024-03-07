import { nextTestSetup } from 'e2e-utils'

describe('next-config-mts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle ESM modules in CommonJS project with next.config.mts', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
