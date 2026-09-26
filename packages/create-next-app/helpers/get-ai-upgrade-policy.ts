/* eslint-disable import/no-extraneous-dependencies */
import { determineAgent } from '@vercel/detect-agent'

export type AIUpgradePolicy = 'security' | 'latest' | 'future' | false

export async function getAIUpgradePolicy(
  policy: AIUpgradePolicy | undefined
): Promise<AIUpgradePolicy> {
  if (policy !== undefined) {
    return policy
  }

  try {
    const { isAgent } = await determineAgent()
    return isAgent ? 'future' : 'security'
  } catch {
    return 'security'
  }
}
