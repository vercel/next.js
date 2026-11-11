import { nextTestSetup } from 'e2e-utils'

describe('app dir - a single page extension', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the root page', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello from the root page')
  })

  it('should render a nested page', async () => {
    const $ = await next.render$('/nested')
    expect($('p').text()).toBe('hello from a nested page')
  })
})
