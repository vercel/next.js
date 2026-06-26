import { nextTestSetup } from 'e2e-utils'

describe('dynamic-requests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not error for dynamic requests in pages', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('Hello World')
  })

  it('should not error for dynamic requests in routes', async () => {
    const res = await next.fetch('/hello')
    const html = await res.text()
    expect(html).toContain('Hello World')
  })
})
