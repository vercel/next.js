import { ignoreLoggingIncomingRequests } from './log-requests'
import type { NodeNextRequest } from '../base-http/node'
import type { LoggingConfig } from '../config-shared'

describe('ignoreLoggingIncomingRequests', () => {
  const createMockRequest = (url: string): NodeNextRequest => {
    return { url } as NodeNextRequest
  }

  it('should respect boolean config', () => {
    const req = createMockRequest('/test')

    expect(
      ignoreLoggingIncomingRequests(req, { incomingRequests: false })
    ).toBe(true)
    expect(ignoreLoggingIncomingRequests(req, { incomingRequests: true })).toBe(
      false
    )
  })

  it('should not ignore when no ignore patterns configured', () => {
    const req = createMockRequest('/test')

    expect(ignoreLoggingIncomingRequests(req, {})).toBe(false)
    expect(ignoreLoggingIncomingRequests(req, undefined)).toBe(false)
  })

  it('should handle array of RegExp ignore patterns', () => {
    const config: LoggingConfig = {
      incomingRequests: {
        ignore: [/^\/api\//, /^\/healthcheck/, /^\/_next\/static\//],
      },
    }

    expect(
      ignoreLoggingIncomingRequests(createMockRequest('/api/test'), config)
    ).toBe(true)
    expect(
      ignoreLoggingIncomingRequests(createMockRequest('/healthcheck'), config)
    ).toBe(true)
    expect(
      ignoreLoggingIncomingRequests(
        createMockRequest('/_next/static/test.js'),
        config
      )
    ).toBe(true)
    expect(
      ignoreLoggingIncomingRequests(createMockRequest('/page'), config)
    ).toBe(false)
  })
})
