import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-dev', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work on dev server', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
