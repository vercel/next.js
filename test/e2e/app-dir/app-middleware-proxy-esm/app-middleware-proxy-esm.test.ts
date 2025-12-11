/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'

describe('app-dir with proxy (ESM-only)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load proxy middleware in ESM-only project', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Hello from ESM proxy')
  })

  it('should handle proxy rewrite in ESM-only project', async () => {
    const res = await next.fetch('/test')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Rewritten')
  })

  it('should add headers from proxy in ESM-only project', async () => {
    const res = await next.fetch('/api/test')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-from-proxy')).toBe('hello-from-proxy')
  })
})
