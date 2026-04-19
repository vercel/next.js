import { nextTestSetup } from 'e2e-utils'

describe('mjs as extension', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page correctly', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world!')
  })
})
