import { nextTestSetup } from 'e2e-utils'

describe('turbopack-loader-resolve', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('supports callback-style loader resolve', async () => {
    const $ = await next.render$('/')
    expect($('#resolved').text()).toBe('resolved-value.js')
  })
})
