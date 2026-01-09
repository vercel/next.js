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
 * Resolves and sets the deployment ID from config, handling precedence and ensuring function is only evaluated once.
 * User-configured deploymentId always takes precedence over NEXT_DEPLOYMENT_ID.
 * If configDeploymentId is already a string, it was evaluated earlier - use it directly.
 * If configDeploymentId is a function, evaluate it once here (regardless of NEXT_DEPLOYMENT_ID).
 * Only sets NEXT_DEPLOYMENT_ID if it wasn't already set (to avoid overwriting if function was called before).
 *
 * @param configDeploymentId - The deploymentId from config (can be string, function, or undefined)
 * @returns The resolved deploymentId string to use
 */
export function resolveAndSetDeploymentId(
  configDeploymentId: string | (() => string) | undefined
): string {
  // User-configured deploymentId always takes precedence over NEXT_DEPLOYMENT_ID
  // Evaluate function once if needed (if it's a function, not already a string)
  let userConfiguredDeploymentId: string | undefined
  if (typeof configDeploymentId === 'string') {
    // Already evaluated earlier (e.g., in config.ts), use the cached value
    // This ensures the function is only called once
    userConfiguredDeploymentId = configDeploymentId
  } else if (configDeploymentId != null) {
    // Function hasn't been evaluated yet - evaluate it once now
    // We evaluate regardless of NEXT_DEPLOYMENT_ID to ensure user config can take precedence
    userConfiguredDeploymentId = generateDeploymentId(configDeploymentId)
  } else {
    // No user configuration provided
    userConfiguredDeploymentId = undefined
  }

  // Validate length early (before setting env var or returning)
  if (userConfiguredDeploymentId !== undefined) {
    if (userConfiguredDeploymentId.length > 32) {
      throw new Error(
        `The deploymentId "${userConfiguredDeploymentId}" exceeds the maximum length of 32 characters. Please choose a shorter deploymentId in your next.config.js. https://nextjs.org/docs/messages/deploymentid-too-long`
      )
    }
    if (userConfiguredDeploymentId.startsWith('dpl_')) {
      throw new Error(
        `The deploymentId "${userConfiguredDeploymentId}" cannot start with the "dpl_" prefix. Please choose a different deploymentId in your next.config.js. https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id`
      )
    }
  }

  // User-configured deploymentId always takes precedence over NEXT_DEPLOYMENT_ID
  if (userConfiguredDeploymentId !== undefined) {
    // User-configured deploymentId always takes precedence
    // Use bracket notation to prevent webpack from replacing this at build time
    process.env['NEXT_DEPLOYMENT_ID'] = userConfiguredDeploymentId
    return userConfiguredDeploymentId
  } else if (process.env['NEXT_DEPLOYMENT_ID'] != null) {
    // No user config, use NEXT_DEPLOYMENT_ID if set
    return process.env['NEXT_DEPLOYMENT_ID']
  } else {
    // Neither is set, use empty string
    return ''
  }
}
