import { nextTestSetup } from 'e2e-utils'

describe('mangle-reserved', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve the name', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('AbortSignal')
  })
})
