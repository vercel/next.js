import {
  agentFeedbackInstructionsCli,
  loadAgentFeedbackInstructions,
} from './agent-feedback-instructions'

describe('loadAgentFeedbackInstructions', () => {
  it('returns the protocol when feedback is enabled', async () => {
    await expect(
      loadAgentFeedbackInstructions(
        {},
        async () => true,
        async () => '# Agent feedback protocol\n',
        () => true
      )
    ).resolves.toBe('# Agent feedback protocol\n')
  })

  it('does not read the protocol when feedback is disabled', async () => {
    const readProtocol = jest.fn(async () => '# Agent feedback protocol\n')

    await expect(
      loadAgentFeedbackInstructions({}, async () => false, readProtocol)
    ).resolves.toBeNull()
    expect(readProtocol).not.toHaveBeenCalled()
  })

  it('does not check the remote gate when feedback is locally disabled', async () => {
    const isEnabled = jest.fn(async () => true)
    const readProtocol = jest.fn(async () => '# Agent feedback protocol\n')

    await expect(
      loadAgentFeedbackInstructions({}, isEnabled, readProtocol, () => false)
    ).resolves.toBeNull()
    expect(isEnabled).not.toHaveBeenCalled()
    expect(readProtocol).not.toHaveBeenCalled()
  })

  it('returns dry-run instructions without checking the remote gate', async () => {
    const isEnabled = jest.fn(async () => false)
    const isLocallyEnabled = jest.fn(() => false)

    await expect(
      loadAgentFeedbackInstructions(
        { dryRun: true },
        isEnabled,
        async () => '# Agent feedback protocol\n',
        isLocallyEnabled
      )
    ).resolves.toBe(
      '# Dry run\n\nUse the protocol below to prepare each qualifying report draft and encode its review URL, but do not open a browser tab. Print each review URL for inspection instead. Do not clear the feedback candidate queue or mark the reporting pass complete.\n\n# Agent feedback protocol\n'
    )
    expect(isEnabled).not.toHaveBeenCalled()
    expect(isLocallyEnabled).not.toHaveBeenCalled()
  })

  it('fails closed when the protocol cannot be read', async () => {
    await expect(
      loadAgentFeedbackInstructions(
        {},
        async () => true,
        async () => {
          throw new Error('protocol unavailable')
        },
        () => true
      )
    ).resolves.toBeNull()
  })

  it('propagates feedback status errors', async () => {
    await expect(
      loadAgentFeedbackInstructions(
        {},
        async () => {
          throw new Error('network unavailable')
        },
        undefined,
        () => true
      )
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

    await agentFeedbackInstructionsCli({}, async () => {
      throw new Error('network unavailable')
    })

    expect(writeError).toHaveBeenCalledWith(
      'Unable to check whether Next.js agent feedback is enabled. Rerun this command with network access.\n'
    )
    expect(process.exitCode).toBe(1)
  })
})
