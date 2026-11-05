import { nextTestSetup } from 'e2e-utils'

// There is no pages directory, so there is no `/_error` page to render for
// client error statuses other than 404.
describe('app-router-client-error-status', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should keep the status of a route handler response', async () => {
    const res = await next.fetch('/status/403')
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('explicit status')
  })

  it('should respond with 400 for a malformed path parameter', async () => {
    const res = await next.fetch('/items/%E0%A4')
    expect(res.status).toBe(400)
  })

  it('should respond with 405 for a POST to a public file', async () => {
    const res = await next.fetch('/hello.txt', { method: 'POST' })
    expect(res.status).toBe(405)
  })

  it('should respond with 412 for a failed If-Match precondition', async () => {
    const res = await next.fetch('/hello.txt', {
      headers: { 'If-Match': '"nope"' },
    })
    expect(res.status).toBe(412)
  })

  it('should respond with 416 for an unsatisfiable range', async () => {
    const res = await next.fetch('/hello.txt', {
      headers: { Range: 'bytes=500-600' },
    })
    expect(res.status).toBe(416)
  })

  it('should still serve valid requests', async () => {
    const res = await next.fetch('/items/ok')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('ok')
  })
})
