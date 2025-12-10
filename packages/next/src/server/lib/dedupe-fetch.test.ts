/**
 * @jest-environment node
 */

// Mock the React module first
jest.mock('react', () => ({
  cache: <T extends (...args: any[]) => any>(fn: T): T => {
    const cache = new Map<string, ReturnType<T>>()
    return ((...args: Parameters<T>) => {
      const key = JSON.stringify(args)
      if (!cache.has(key)) {
        cache.set(key, fn(...args))
      }
      return cache.get(key)!
    }) as T
  },
}))

// Mock the clone-response module
jest.mock('./clone-response', () => ({
  cloneResponse: (response: Response) => {
    // Create two independent clones of the response
    const clone1 = response.clone()
    const clone2 = response.clone()
    return [clone1, clone2]
  },
}))

import { createDedupeFetch } from './dedupe-fetch'

describe('dedupe-fetch', () => {
  let originalFetch: jest.MockedFunction<typeof fetch>
  let dedupeFetch: ReturnType<typeof createDedupeFetch>

  beforeEach(() => {
    // Create a fresh mock for each test
    originalFetch = jest.fn()
    dedupeFetch = createDedupeFetch(originalFetch)

    // Clear all mocks between tests
    jest.clearAllMocks()
  })

  describe('deduplication behavior', () => {
    it('should dedupe identical GET requests', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      // Make two identical requests
      const promise1 = dedupeFetch('https://example.com/api')
      const promise2 = dedupeFetch('https://example.com/api')

      const [response1, response2] = await Promise.all([promise1, promise2])

      // Should only call original fetch once
      expect(originalFetch).toHaveBeenCalledTimes(1)
      expect(originalFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        undefined
      )

      // Both responses should be valid
      expect(await response1.text()).toBe('test response')
      expect(await response2.text()).toBe('test response')
    })

    it('should dedupe identical HEAD requests', async () => {
      const mockResponse = new Response(null, { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      // Make two identical HEAD requests
      const promise1 = dedupeFetch('https://example.com/api', {
        method: 'HEAD',
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        method: 'HEAD',
      })

      await Promise.all([promise1, promise2])

      // Should only call original fetch once
      expect(originalFetch).toHaveBeenCalledTimes(1)
    })

    it('should not dedupe requests with different URLs', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make requests to different URLs
      const promise1 = dedupeFetch('https://example.com/api1')
      const promise2 = dedupeFetch('https://example.com/api2')

      const [response1, response2] = await Promise.all([promise1, promise2])

      // Should call original fetch twice
      expect(originalFetch).toHaveBeenCalledTimes(2)
      expect(await response1.text()).toBe('response 1')
      expect(await response2.text()).toBe('response 2')
    })

    it('should not dedupe requests with different headers', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make requests with different headers
      const promise1 = dedupeFetch('https://example.com/api', {
        headers: { 'X-Custom': 'value1' },
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        headers: { 'X-Custom': 'value2' },
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })

    it('should dedupe requests with different traceparent headers', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make requests with different traceparent headers (W3C Trace Context)
      // Each traceparent represents a different distributed trace
      const promise1 = dedupeFetch('https://example.com/api', {
        headers: {
          traceparent:
            '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        },
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        headers: {
          traceparent:
            '00-0af7651916cd43dd8448eb211c80319c-b9c7c989f97918e1-01',
        },
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch once (different trace contexts are ok to be deduped)
      expect(originalFetch).toHaveBeenCalledTimes(1)
      expect(originalFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/api',
        expect.objectContaining({
          headers: {
            traceparent:
              '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          },
        })
      )
    })

    it('should dedupe requests with different tracestate headers', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make requests with different tracestate headers (W3C Trace Context)
      // tracestate is vendor-specific trace data
      const promise1 = dedupeFetch('https://example.com/api', {
        headers: {
          traceparent:
            '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          tracestate: 'vendor1=value1,vendor2=value2',
        },
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        headers: {
          traceparent:
            '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          tracestate: 'vendor1=value3,vendor2=value4',
        },
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch once (different tracestate values are ok to be deduped)
      expect(originalFetch).toHaveBeenCalledTimes(1)
      expect(originalFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/api',
        expect.objectContaining({
          headers: {
            traceparent:
              '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
            tracestate: 'vendor1=value1,vendor2=value2',
          },
        })
      )
    })

    it('should not dedupe requests with different request modes', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make requests with different modes
      const promise1 = dedupeFetch('https://example.com/api', {
        mode: 'cors',
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        mode: 'no-cors',
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })

    it('should handle multiple sequential duplicate requests', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      // Make three identical requests
      const promise1 = dedupeFetch('https://example.com/api')
      const promise2 = dedupeFetch('https://example.com/api')
      const promise3 = dedupeFetch('https://example.com/api')

      const [response1, response2, response3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ])

      // Should only call original fetch once
      expect(originalFetch).toHaveBeenCalledTimes(1)

      // All responses should be valid
      expect(await response1.text()).toBe('test response')
      expect(await response2.text()).toBe('test response')
      expect(await response3.text()).toBe('test response')
    })
  })

  describe('signal handling', () => {
    it('should not dedupe requests with signals', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      const controller1 = new AbortController()
      const controller2 = new AbortController()

      // Make requests with signals
      const promise1 = dedupeFetch('https://example.com/api', {
        signal: controller1.signal,
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        signal: controller2.signal,
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice (signals opt out of deduplication)
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })

    it('should pass signal through to original fetch', async () => {
      const mockResponse = new Response('response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const controller = new AbortController()

      await dedupeFetch('https://example.com/api', {
        signal: controller.signal,
      })

      expect(originalFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({ signal: controller.signal })
      )
    })
  })

  describe('method handling', () => {
    it('should not dedupe POST requests', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make two POST requests
      const promise1 = dedupeFetch('https://example.com/api', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice (POST requests are not deduped)
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })

    it('should not dedupe PUT requests', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make two PUT requests
      const promise1 = dedupeFetch('https://example.com/api', {
        method: 'PUT',
        body: JSON.stringify({ data: 'test' }),
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        method: 'PUT',
        body: JSON.stringify({ data: 'test' }),
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })

    it('should not dedupe DELETE requests', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make two DELETE requests
      const promise1 = dedupeFetch('https://example.com/api', {
        method: 'DELETE',
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        method: 'DELETE',
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })

    it('should not dedupe PATCH requests', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make two PATCH requests
      const promise1 = dedupeFetch('https://example.com/api', {
        method: 'PATCH',
        body: JSON.stringify({ data: 'test' }),
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        method: 'PATCH',
        body: JSON.stringify({ data: 'test' }),
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('keepalive handling', () => {
    it('should not dedupe requests with keepalive', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      // Make requests with keepalive
      const promise1 = dedupeFetch('https://example.com/api', {
        keepalive: true,
      })
      const promise2 = dedupeFetch('https://example.com/api', {
        keepalive: true,
      })

      await Promise.all([promise1, promise2])

      // Should call original fetch twice (keepalive opts out of deduplication)
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('Request object handling', () => {
    it('should handle Request objects as input', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const request = new Request('https://example.com/api', {
        method: 'GET',
        headers: { 'X-Custom': 'value' },
      })

      const response = await dedupeFetch(request)

      expect(originalFetch).toHaveBeenCalledTimes(1)
      expect(await response.text()).toBe('test response')
    })

    it('should dedupe identical Request objects', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const request1 = new Request('https://example.com/api')
      const request2 = new Request('https://example.com/api')

      const promise1 = dedupeFetch(request1)
      const promise2 = dedupeFetch(request2)

      const [response1, response2] = await Promise.all([promise1, promise2])

      // Should only call original fetch once
      expect(originalFetch).toHaveBeenCalledTimes(1)
      expect(await response1.text()).toBe('test response')
      expect(await response2.text()).toBe('test response')
    })

    it('should not dedupe Request objects with different properties', async () => {
      const mockResponse1 = new Response('response 1', { status: 200 })
      const mockResponse2 = new Response('response 2', { status: 200 })

      originalFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      const request1 = new Request('https://example.com/api', {
        headers: { 'X-Custom': 'value1' },
      })
      const request2 = new Request('https://example.com/api', {
        headers: { 'X-Custom': 'value2' },
      })

      const promise1 = dedupeFetch(request1)
      const promise2 = dedupeFetch(request2)

      await Promise.all([promise1, promise2])

      // Should call original fetch twice
      expect(originalFetch).toHaveBeenCalledTimes(2)
    })

    it('should preserve the Request object body when it is a ReadableStream', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('stream data'))
          controller.close()
        },
      })

      const request = new Request('https://example.com/api', {
        method: 'POST',
        body: stream,
        // @ts-ignore - duplex is required for streaming bodies in Node.js
        duplex: 'half',
      })

      await dedupeFetch(request)

      // Should pass the request as-is without creating a new Request
      expect(originalFetch).toHaveBeenCalledWith(request, undefined)
    })
  })

  describe('URL handling', () => {
    it('should handle URL objects as input', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const url = new URL('https://example.com/api')
      const response = await dedupeFetch(url)

      expect(originalFetch).toHaveBeenCalledTimes(1)
      expect(await response.text()).toBe('test response')
    })

    it('should dedupe identical URL objects', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const url1 = new URL('https://example.com/api')
      const url2 = new URL('https://example.com/api')

      const promise1 = dedupeFetch(url1)
      const promise2 = dedupeFetch(url2)

      const [response1, response2] = await Promise.all([promise1, promise2])

      // Should only call original fetch once
      expect(originalFetch).toHaveBeenCalledTimes(1)
      expect(await response1.text()).toBe('test response')
      expect(await response2.text()).toBe('test response')
    })
  })

  describe('cache key generation', () => {
    it('should generate consistent cache keys for identical requests', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      // Make requests with identical options but in different order
      const promise1 = dedupeFetch('https://example.com/api', {
        headers: {
          'X-Header-A': 'value-a',
          'X-Header-B': 'value-b',
        },
        mode: 'cors',
        credentials: 'include',
      })

      const promise2 = dedupeFetch('https://example.com/api', {
        credentials: 'include',
        mode: 'cors',
        headers: {
          'X-Header-A': 'value-a',
          'X-Header-B': 'value-b',
        },
      })

      await Promise.all([promise1, promise2])

      // Should only call original fetch once (same cache key)
      expect(originalFetch).toHaveBeenCalledTimes(1)
    })

    it('should use simple cache key for string URL without options', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      // Multiple simple GET requests
      const promise1 = dedupeFetch('https://example.com/api')
      const promise2 = dedupeFetch('https://example.com/api')

      await Promise.all([promise1, promise2])

      // Should only call original fetch once (using simple cache key)
      expect(originalFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('should propagate fetch errors', async () => {
      const error = new Error('Network error')
      originalFetch.mockRejectedValue(error)

      await expect(dedupeFetch('https://example.com/api')).rejects.toThrow(
        'Network error'
      )
    })

    it('should share errors between deduped requests', async () => {
      const error = new Error('Network error')
      originalFetch.mockRejectedValue(error)

      const promise1 = dedupeFetch('https://example.com/api')
      const promise2 = dedupeFetch('https://example.com/api')

      await expect(promise1).rejects.toThrow('Network error')
      await expect(promise2).rejects.toThrow('Network error')

      // Should only call original fetch once
      expect(originalFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('response cloning', () => {
    it('should allow multiple consumers to read the response body', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const promise1 = dedupeFetch('https://example.com/api')
      const promise2 = dedupeFetch('https://example.com/api')

      const [response1, response2] = await Promise.all([promise1, promise2])

      // Both responses should be able to read the body independently
      const text1 = await response1.text()
      const text2 = await response2.text()

      expect(text1).toBe('test response')
      expect(text2).toBe('test response')
    })

    it('should preserve response properties when cloning', async () => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      })

      const mockResponse = new Response('{"data": "test"}', {
        status: 201,
        statusText: 'Created',
        headers,
      })

      originalFetch.mockResolvedValue(mockResponse)

      const promise1 = dedupeFetch('https://example.com/api')
      const promise2 = dedupeFetch('https://example.com/api')

      const [response1, response2] = await Promise.all([promise1, promise2])

      // Check that both responses have the correct properties
      expect(response1.status).toBe(201)
      expect(response1.statusText).toBe('Created')
      expect(response1.headers.get('Content-Type')).toBe('application/json')
      expect(response1.headers.get('X-Custom')).toBe('value')

      expect(response2.status).toBe(201)
      expect(response2.statusText).toBe('Created')
      expect(response2.headers.get('Content-Type')).toBe('application/json')
      expect(response2.headers.get('X-Custom')).toBe('value')
    })
  })

  describe('request options', () => {
    it('should handle various request options', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const options: RequestInit = {
        method: 'GET',
        headers: { 'X-Custom': 'value' },
        mode: 'cors',
        credentials: 'include',
        redirect: 'follow',
        referrer: 'https://referrer.com',
        referrerPolicy: 'no-referrer',
        integrity: 'sha256-abc123',
      }

      await dedupeFetch('https://example.com/api', options)

      expect(originalFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        options
      )
    })

    it('should dedupe requests with identical complex options', async () => {
      const mockResponse = new Response('test response', { status: 200 })
      originalFetch.mockResolvedValue(mockResponse)

      const options: RequestInit = {
        headers: { 'X-Custom': 'value', Authorization: 'Bearer token' },
        mode: 'cors',
        credentials: 'include',
        redirect: 'manual',
        referrer: 'https://referrer.com',
        referrerPolicy: 'strict-origin',
        integrity: 'sha256-abc123',
      }

      const promise1 = dedupeFetch('https://example.com/api', options)
      const promise2 = dedupeFetch('https://example.com/api', options)

      await Promise.all([promise1, promise2])

      // Should only call original fetch once
      expect(originalFetch).toHaveBeenCalledTimes(1)
    })
  })
})
