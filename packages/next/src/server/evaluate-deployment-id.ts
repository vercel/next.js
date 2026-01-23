/**
 * Evaluates a deployment ID from a user-provided function or string.
 * Returns the string value, calling the function if needed.
 * Returns empty string if undefined (for runtime use where a string is always needed).
 * Handles all possible input types at runtime, including broader Function types.
 *
 * This file is safe to use in edge runtime - it does NOT modify process.env.
 */
export function evaluateDeploymentId(
  deploymentId: string | (() => string) | Function | undefined | null | unknown
): string {
  // Handle function type (including broader Function type, not just () => string)
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

  // Handle null, undefined, or any other type
  return ''
}
