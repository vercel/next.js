import { getNextErrorFeedbackMiddleware } from './get-next-error-feedback-middleware'
import type { IncomingMessage, ServerResponse } from 'http'

describe('getNextErrorFeedbackMiddleware', () => {
  const mockTelemetry = {
    record: jest.fn().mockResolvedValue({}),
  } as any

  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let mockNext: jest.Mock

  beforeEach(() => {
    mockReq = {
      url: '/__nextjs_error_feedback?errorCode=TEST_ERROR&wasHelpful=true',
    }
    mockRes = {
      setHeader: jest.fn(),
      end: jest.fn(),
    }
    mockNext = jest.fn()
    jest.clearAllMocks()
  })

  it('calls next() if path does not match', async () => {
    mockReq.url = '/some-other-path'

    await getNextErrorFeedbackMiddleware(mockTelemetry)(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
      mockNext
    )

    expect(mockNext).toHaveBeenCalled()
    expect(mockTelemetry.record).not.toHaveBeenCalled()
  })

  it('records telemetry when feedback is submitted', async () => {
    await getNextErrorFeedbackMiddleware(mockTelemetry)(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
      mockNext
    )

    expect(mockTelemetry.record).toHaveBeenCalledWith({
      eventName: 'NEXT_ERROR_FEEDBACK',
      payload: {
        errorCode: 'TEST_ERROR',
        wasHelpful: true,
      },
    })
    expect(mockRes.statusCode).toBe(204)
  })

  it('returns 400 if params are missing', async () => {
    mockReq.url = '/__nextjs_error_feedback'

    await getNextErrorFeedbackMiddleware(mockTelemetry)(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
      mockNext
    )

    expect(mockRes.statusCode).toBe(400)
    expect(mockTelemetry.record).not.toHaveBeenCalled()
  })

  it('returns 500 if telemetry recording fails', async () => {
    mockTelemetry.record.mockRejectedValueOnce(new Error('Failed to record'))

    await getNextErrorFeedbackMiddleware(mockTelemetry)(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
      mockNext
    )

    expect(mockRes.statusCode).toBe(500)
  })
})
