import { nextTestSetup } from 'e2e-utils'

describe('Dynamic Optional Routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render optional catch-all top-level route with no segments', async () => {
    const $ = await next.render$('/')
    expect($('#success').text()).toBe('yay')
  })

  it('should render optional catch-all top-level route with one segment', async () => {
    const $ = await next.render$('/one')
    expect($('#success').text()).toBe('one')
  })

  it('should render optional catch-all top-level route with two segments', async () => {
    const $ = await next.render$('/one/two')
    expect($('#success').text()).toBe('one,two')
  })
})
