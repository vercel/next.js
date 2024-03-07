import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle CJS modules in Native ESM project', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobarbaz')
  })
})
