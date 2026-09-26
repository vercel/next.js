import { nextTestSetup } from 'e2e-utils'

describe('app dir - dynamic segment invalid encoding', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 404 for a dynamic segment with an un-decodable percent-encoded sequence', async () => {
    // %A0 is a continuation byte that is not valid on its own as UTF-8.
    // Previously this caused a 500 in production and a 400 in development.
    // It should produce a 404 (Not Found) consistently.
    const res = await next.fetch('/bar%A0')
    expect(res.status).toBe(404)
  })

  it('should still serve valid percent-encoded dynamic segments', async () => {
    // %20 is a valid encoding for a space character – this should render correctly.
    const res = await next.fetch('/hello%20world')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello%20world')
  })
})
