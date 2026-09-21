import { loadAgentFeedbackInstructions } from './agent-feedback-instructions'

describe('loadAgentFeedbackInstructions', () => {
  it('returns the protocol when feedback is enabled', async () => {
    await expect(
      loadAgentFeedbackInstructions(
        async () => true,
        async () => '# Agent feedback protocol\n'
      )
    ).resolves.toBe('# Agent feedback protocol\n')
  })

  it('does not read the protocol when feedback is disabled', async () => {
    const readProtocol = jest.fn(async () => '# Agent feedback protocol\n')

    await expect(
      loadAgentFeedbackInstructions(async () => false, readProtocol)
    ).resolves.toBeNull()
    expect(readProtocol).not.toHaveBeenCalled()
  })

  it('fails closed when the protocol cannot be read', async () => {
    await expect(
      loadAgentFeedbackInstructions(
        async () => true,
        async () => {
          throw new Error('protocol unavailable')
        }
      )
    ).resolves.toBeNull()
  })
})
