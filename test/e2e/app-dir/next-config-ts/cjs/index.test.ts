import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-cjs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle ESM modules in CommonJS project', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobarbaz')
  })
})
