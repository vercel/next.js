import { shouldLogIncomingRequest } from './log-requests'
import type { NodeNextRequest } from '../base-http/node'
import type { LoggingConfig } from '../config-shared'

describe('shouldLogIncomingRequest', () => {
  const createMockRequest = (url: string): NodeNextRequest => {
    return { url } as NodeNextRequest
  }

  it('should return true when logging config is undefined', () => {
    const req = createMockRequest('/api/test')
    expect(shouldLogIncomingRequest(req, undefined)).toBe(true)
  })

  it('should return true when incomingRequest is true', () => {
    const req = createMockRequest('/api/test')
    const config: LoggingConfig = { incomingRequest: true }
    expect(shouldLogIncomingRequest(req, config)).toBe(true)
  })

  it('should return false when incomingRequest is false', () => {
    const req = createMockRequest('/api/test')
    const config: LoggingConfig = { incomingRequest: false }
    expect(shouldLogIncomingRequest(req, config)).toBe(false)
  })

  it('should return true when ignorePattern is empty', () => {
    const req = createMockRequest('/api/test')
    const config: LoggingConfig = {
      incomingRequest: { ignorePattern: [] },
    }
    expect(shouldLogIncomingRequest(req, config)).toBe(true)
  })

  it('should filter requests matching ignorePattern', () => {
    const req = createMockRequest('/api/health')
    const config: LoggingConfig = {
      incomingRequest: {
        ignorePattern: [/^\/api\/health/],
      },
    }
    expect(shouldLogIncomingRequest(req, config)).toBe(false)
  })

  it('should allow requests not matching ignorePattern', () => {
    const req = createMockRequest('/api/users')
    const config: LoggingConfig = {
      incomingRequest: {
        ignorePattern: [/^\/api\/health/, /^\/metrics/],
      },
    }
    expect(shouldLogIncomingRequest(req, config)).toBe(true)
  })

  it('should return true when ignorePattern contains invalid patterns', () => {
    const req = createMockRequest('/api/test')
    const config: LoggingConfig = {
      incomingRequest: {
        // @ts-expect-error testing invalid pattern
        ignorePattern: ['not-a-regex'],
      },
    }
    expect(shouldLogIncomingRequest(req, config)).toBe(true)
  })
})
