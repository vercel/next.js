import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('http-methods in dev mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 405 for POST request to a page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/', undefined, {
      method: 'POST',
    })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('should return 405 for PUT request to a page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/', undefined, {
      method: 'PUT',
    })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('should return 405 for DELETE request to a page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/', undefined, {
      method: 'DELETE',
    })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('should return 405 for PATCH request to a page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/', undefined, {
      method: 'PATCH',
    })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('should return 200 for GET request to a page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/', undefined, {
      method: 'GET',
    })
    expect(res.status).toBe(200)
  })

  it('should return 200 for HEAD request to a page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/', undefined, {
      method: 'HEAD',
    })
    expect(res.status).toBe(200)
  })

  it('should return 405 for POST request to a nested page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/about', undefined, {
      method: 'POST',
    })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('should return 200 for GET request to a nested page', async () => {
    const res = await fetchViaHTTP(next.appPort, '/about', undefined, {
      method: 'GET',
    })
    expect(res.status).toBe(200)
  })

  it('should allow POST request to an API route', async () => {
    const res = await fetchViaHTTP(next.appPort, '/api/hello', undefined, {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.method).toBe('POST')
  })

  it('should allow PUT request to an API route', async () => {
    const res = await fetchViaHTTP(next.appPort, '/api/hello', undefined, {
      method: 'PUT',
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.method).toBe('PUT')
  })

  it('should allow DELETE request to an API route', async () => {
    const res = await fetchViaHTTP(next.appPort, '/api/hello', undefined, {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.method).toBe('DELETE')
  })

  it('should allow GET request to an API route', async () => {
    const res = await fetchViaHTTP(next.appPort, '/api/hello', undefined, {
      method: 'GET',
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.method).toBe('GET')
  })
})
