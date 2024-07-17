import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-export-default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support dynamic import', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
