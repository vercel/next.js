import { nextTestSetup } from 'e2e-utils'

// An App Router-only app has no Pages Router `_error`, which is what renders
// any status other than 404 and 500.
describe('app-only-error-status', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('responds with 400 for a param with malformed percent-encoding', async () => {
    const res = await next.fetch('/items/%E0%A4')
    expect(res.status).toBe(400)
  })

  it('responds with 405 for a POST to a public file', async () => {
    const res = await next.fetch('/hello.txt', { method: 'POST' })
    expect(res.status).toBe(405)
  })

  it('responds with 416 for a range outside a public file', async () => {
    const res = await next.fetch('/hello.txt', {
      headers: { range: 'bytes=500-600' },
    })
    expect(res.status).toBe(416)
  })

  it('responds with 412 for a failed If-Match on a public file', async () => {
    const res = await next.fetch('/hello.txt', {
      headers: { 'if-match': '"nope"' },
    })
    expect(res.status).toBe(412)
  })

  it('renders the page for a well-formed param', async () => {
    const $ = await next.render$('/items/hello')
    expect($('p').text()).toBe('hello')
  })
})
