import { nextTestSetup } from 'e2e-utils'

describe('pages-405-method', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 405 for POST to a plain page', async () => {
    const res = await next.fetch('/', { method: 'POST' })
    expect(res.status).toBe(405)
    expect(await res.text()).toContain('Method Not Allowed')
  })

  it('should return 405 for PUT to a plain page', async () => {
    const res = await next.fetch('/', { method: 'PUT' })
    expect(res.status).toBe(405)
  })

  it('should return 405 for DELETE to a plain page', async () => {
    const res = await next.fetch('/', { method: 'DELETE' })
    expect(res.status).toBe(405)
  })

  it('should return 405 for OPTIONS to a plain page', async () => {
    const res = await next.fetch('/', { method: 'OPTIONS' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('should return 405 for POST to an SSG page', async () => {
    const res = await next.fetch('/ssg', { method: 'POST' })
    expect(res.status).toBe(405)
  })

  it('should return 200 for GET to a plain page', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
  })

  it('should return 200 for HEAD to a plain page', async () => {
    const res = await next.fetch('/', { method: 'HEAD' })
    expect(res.status).toBe(200)
  })

  it('should allow POST to a page with getServerSideProps', async () => {
    const res = await next.fetch('/ssr', { method: 'POST' })
    // Pages with getServerSideProps can handle POST since they receive `req`.
    // Assert a specific success status so a 500 from a render regression would
    // also fail this test (rather than passing under a permissive `not.toBe`).
    expect(res.status).toBe(200)
  })

  it('should allow POST to a page with getInitialProps', async () => {
    const res = await next.fetch('/gip', { method: 'POST' })
    // Pages with getInitialProps can handle POST since their resolver
    // receives the request and may act on the method.
    expect(res.status).toBe(200)
  })
})
