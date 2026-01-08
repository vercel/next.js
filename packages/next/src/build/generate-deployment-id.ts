/**
 * Generates a deployment ID from a user-provided function or string.
 * Similar to generateBuildId, but for deploymentId.
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

/**
 * Evaluates a deployment ID from a user-provided function or string.
 * Returns the string value, calling the function if needed.
 * Returns empty string if undefined (for runtime use where a string is always needed).
 * Handles all possible input types at runtime, including broader Function types.
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

/**
 * Resolves and sets the deployment ID from config, handling precedence and avoiding duplicate function calls.
 * User-configured deploymentId takes precedence over NEXT_DEPLOYMENT_ID.
 * Only evaluates the function if NEXT_DEPLOYMENT_ID is not already set (to avoid calling it multiple times).
 *
 * @param configDeploymentId - The deploymentId from config (can be string, function, or undefined)
 * @returns The resolved deploymentId string to use
 */
export function resolveAndSetDeploymentId(
  configDeploymentId: string | (() => string) | undefined
): string {
  // If config.deploymentId is already a string (evaluated earlier, e.g., in config.ts), use it directly
  // Otherwise, evaluate it (but only if NEXT_DEPLOYMENT_ID is not already set to avoid re-evaluating)
  let userConfiguredDeploymentId: string | undefined
  if (typeof configDeploymentId === 'string') {
    // Already evaluated, use the cached value
    userConfiguredDeploymentId = configDeploymentId
  } else if (
    configDeploymentId != null &&
    process.env.NEXT_DEPLOYMENT_ID == null
  ) {
    // Only evaluate if NEXT_DEPLOYMENT_ID is not already set (to avoid calling function multiple times)
    userConfiguredDeploymentId = generateDeploymentId(configDeploymentId)
  } else {
    // NEXT_DEPLOYMENT_ID is already set, don't re-evaluate the function
    userConfiguredDeploymentId = undefined
  }

  // User-configured deploymentId takes precedence over NEXT_DEPLOYMENT_ID
  if (userConfiguredDeploymentId !== undefined) {
    // Use user-configured deploymentId
    // Only overwrite NEXT_DEPLOYMENT_ID if it wasn't already set (to avoid overwriting if function was called before)
    if (process.env.NEXT_DEPLOYMENT_ID == null) {
      process.env.NEXT_DEPLOYMENT_ID = userConfiguredDeploymentId
    }
    return userConfiguredDeploymentId
  } else if (process.env.NEXT_DEPLOYMENT_ID != null) {
    // No user config, use NEXT_DEPLOYMENT_ID if set
    return process.env.NEXT_DEPLOYMENT_ID
  } else {
    // Neither is set, use empty string
    return ''
  }
}
