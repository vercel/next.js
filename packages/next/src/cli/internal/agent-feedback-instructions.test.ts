import {
  agentFeedbackInstructionsCli,
  loadAgentFeedbackInstructions,
} from './agent-feedback-instructions'

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

  it('propagates feedback status errors', async () => {
    await expect(
      loadAgentFeedbackInstructions(async () => {
        throw new Error('network unavailable')
      })
    ).rejects.toThrow('network unavailable')
  })
})

describe('agentFeedbackInstructionsCli', () => {
  const originalExitCode = process.exitCode

  afterEach(() => {
    process.exitCode = originalExitCode
    jest.restoreAllMocks()
  })

  it('reports feedback status errors and exits with a failure', async () => {
    const writeError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)

    await agentFeedbackInstructionsCli(async () => {
      throw new Error('network unavailable')
    })

    expect(writeError).toHaveBeenCalledWith(
      'Unable to check whether Next.js agent feedback is enabled. Rerun this command with network access.\n'
    )
    expect(process.exitCode).toBe(1)
  })
})
