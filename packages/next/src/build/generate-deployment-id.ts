/**
 * Evaluates a deployment ID from a user-provided function or string.
 * Returns the string value, calling the function if needed.
 * This is a runtime helper that doesn't trim (unlike generateDeploymentId).
 */
export function evaluateDeploymentId(
  deploymentId: string | (() => string) | undefined
): string {
  if (typeof deploymentId === 'function') {
    const result = deploymentId()
    if (typeof result !== 'string') {
      throw new Error(
        'deploymentId function must return a string. https://nextjs.org/docs/messages/deploymentid-not-a-string'
      )
    }
    return result
  }

  if (typeof deploymentId === 'string') {
    return deploymentId
  }

  return ''
}

/**
 * Generates a deployment ID from a user-provided function or string.
 * Similar to generateBuildId, but for deploymentId.
 * This is for build-time use.
 * Note: We don't trim to avoid breaking changes - users may have intentional whitespace.
 */
export function generateDeploymentId(
  deploymentId: string | (() => string) | undefined
): string | undefined {
  if (typeof deploymentId === 'function') {
    const result = deploymentId()
    if (typeof result !== 'string') {
      throw new Error(
        'deploymentId function must return a string. https://nextjs.org/docs/messages/deploymentid-not-a-string'
      )
    }
    return result
  }

  if (typeof deploymentId === 'string') {
    return deploymentId
  }

  return undefined
}
