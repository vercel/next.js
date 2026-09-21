import { getAIUpgradePolicy } from '../../../packages/create-next-app/helpers/get-ai-upgrade-policy'

jest.mock('@vercel/detect-agent', () => ({ determineAgent: jest.fn() }), {
  virtual: true,
})

const determineAgent = jest.requireMock('@vercel/detect-agent')
  .determineAgent as jest.Mock

describe('create-next-app AI upgrade policy', () => {
  beforeEach(() => {
    determineAgent.mockReset()
  })

  it('defaults to security for a human', async () => {
    determineAgent.mockResolvedValue({ isAgent: false })

    await expect(getAIUpgradePolicy(undefined)).resolves.toBe('security')
    expect(determineAgent).toHaveBeenCalledTimes(1)
  })

  it('defaults to future for an agent', async () => {
    determineAgent.mockResolvedValue({ isAgent: true })

    await expect(getAIUpgradePolicy(undefined)).resolves.toBe('future')
    expect(determineAgent).toHaveBeenCalledTimes(1)
  })

  it('falls back to security when detection fails', async () => {
    determineAgent.mockRejectedValue(new Error('Detection failed'))

    await expect(getAIUpgradePolicy(undefined)).resolves.toBe('security')
  })

  it.each(['security', 'latest', 'future', false] as const)(
    'uses the explicit policy %s without detection',
    async (policy) => {
      await expect(getAIUpgradePolicy(policy)).resolves.toBe(policy)
      expect(determineAgent).toHaveBeenCalledTimes(0)
    }
  )
})
