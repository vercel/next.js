import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-alias', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support import alias', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
