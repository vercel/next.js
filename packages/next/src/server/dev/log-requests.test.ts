import { ignoreLoggingIncomingRequest } from './log-requests'
import type { NodeNextRequest } from '../base-http/node'
import type { LoggingConfig } from '../config-shared'

describe('ignoreLoggingIncomingRequest', () => {
  const createMockRequest = (url: string): NodeNextRequest => {
    return { url } as NodeNextRequest
  }

  it('should respect boolean config', () => {
    const req = createMockRequest('/test')

    expect(ignoreLoggingIncomingRequest(req, { incomingRequest: false })).toBe(
      true
    )
    expect(ignoreLoggingIncomingRequest(req, { incomingRequest: true })).toBe(
      false
    )
  })

  it('should not ignore when no ignore patterns configured', () => {
    const req = createMockRequest('/test')

    expect(ignoreLoggingIncomingRequest(req, {})).toBe(false)
    expect(ignoreLoggingIncomingRequest(req, undefined)).toBe(false)
  })

  it('should handle array of RegExp ignore patterns', () => {
    const config: LoggingConfig = {
      incomingRequest: {
        ignore: [/^\/api\//, /^\/healthcheck/, /^\/_next\/static\//],
      },
    }

    expect(
      ignoreLoggingIncomingRequest(createMockRequest('/api/test'), config)
    ).toBe(true)
    expect(
      ignoreLoggingIncomingRequest(createMockRequest('/healthcheck'), config)
    ).toBe(true)
    expect(
      ignoreLoggingIncomingRequest(
        createMockRequest('/_next/static/test.js'),
        config
      )
    ).toBe(true)
    expect(
      ignoreLoggingIncomingRequest(createMockRequest('/page'), config)
    ).toBe(false)
  })
})
