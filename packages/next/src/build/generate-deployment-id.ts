/**
 * Generates a deployment ID from a user-provided function or string.
 * Similar to generateBuildId, but for deploymentId.
 */
export async function generateDeploymentId(
  deploymentId: string | (() => string) | undefined,
  fallback: () => string
): Promise<string> {
  if (!deploymentId) {
    // If no deploymentId is provided, generate one using the fallback
    return fallback()
  }

  if (typeof deploymentId === 'function') {
    const result = await deploymentId()
    if (typeof result !== 'string') {
      throw new Error(
        'deploymentId function must return a string. https://nextjs.org/docs/messages/deploymentid-not-a-string'
      )
    }
    return result.trim()
  }

  return deploymentId.trim()
}
