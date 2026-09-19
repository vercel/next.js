import { isAgentFeedbackEnabled } from './agent-feedback-status'

describe('isAgentFeedbackEnabled', () => {
  it('returns true only for an exact successful true response', async () => {
    let requestInit: RequestInit | undefined
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestInit = init
      return new Response('true')
    }

    await expect(isAgentFeedbackEnabled(fetchImpl)).resolves.toBe(true)
    expect(requestInit).toEqual(expect.objectContaining({ cache: 'no-store' }))
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    ['disabled', new Response('false')],
    ['unexpected body', new Response(' true ')],
    ['unsuccessful response', new Response('true', { status: 500 })],
  ])('returns false for an %s', async (_name, response) => {
    const fetchImpl: typeof fetch = async () => response

    await expect(isAgentFeedbackEnabled(fetchImpl)).resolves.toBe(false)
  })

  it('fails closed when the request rejects', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('network unavailable')
    }

    await expect(isAgentFeedbackEnabled(fetchImpl)).resolves.toBe(false)
  })

  it('fails closed when the request times out', async () => {
    const fetchImpl: typeof fetch = (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      })
    }

    await expect(isAgentFeedbackEnabled(fetchImpl, 1)).resolves.toBe(false)
  })
})
