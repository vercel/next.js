import { nextTestSetup } from 'e2e-utils'

describe('middleware-cookies-pages-router', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should make middleware-set cookie available in getServerSideProps', async () => {
    const $ = await next.render$('/')
    expect($('#cookie').text()).toBe('hello')
  })

  it('should make multiple middleware-set cookies available in getServerSideProps', async () => {
    const $ = await next.render$('/multiple')
    expect($('#cookie-1').text()).toBe('value-1')
    expect($('#cookie-2').text()).toBe('value-2')
  })

  it('should make middleware-set cookie available in API routes', async () => {
    const res = await next.fetch('/api/test')
    const json = await res.json()
    expect(json.cookie).toBe('api-value')
  })

  it('should still send Set-Cookie header to the browser', async () => {
    const res = await next.fetch('/')
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('from-middleware=hello')
  })
})
