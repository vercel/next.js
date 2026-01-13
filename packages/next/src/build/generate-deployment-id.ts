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

type DeploymentIdSource = 'user-config' | 'env-var'

/**
 * Resolves and sets the deployment ID from config, handling precedence and ensuring function is only evaluated once.
 * User-configured deploymentId always takes precedence over NEXT_DEPLOYMENT_ID.
 *
 * @param configDeploymentId - The deploymentId from config (can be string, function, or undefined)
 * @param source - Source indicator: 'user-config' treats as user-configured (validates), 'env-var' uses NEXT_DEPLOYMENT_ID
 * @returns The resolved deploymentId string to use
 */
export function resolveAndSetDeploymentId(
  configDeploymentId: string | (() => string) | undefined,
  source: DeploymentIdSource
): string {
  if (source === 'env-var') {
    return process.env['NEXT_DEPLOYMENT_ID'] || ''
  }

  let userConfiguredDeploymentId: string | undefined
  if (typeof configDeploymentId === 'string') {
    userConfiguredDeploymentId = configDeploymentId
  } else if (typeof configDeploymentId === 'function') {
    userConfiguredDeploymentId = generateDeploymentId(configDeploymentId)
  }

  if (userConfiguredDeploymentId !== undefined) {
    // Empty string is treated as "not configured" - fall back to env var
    if (userConfiguredDeploymentId.length === 0) {
      return process.env['NEXT_DEPLOYMENT_ID'] || ''
    }

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
    const validCharacterPattern = /^[a-zA-Z0-9_-]+$/
    if (!validCharacterPattern.test(userConfiguredDeploymentId)) {
      throw new Error(
        `The deploymentId "${userConfiguredDeploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed. https://nextjs.org/docs/messages/deploymentid-invalid-characters`
      )
    }
    process.env['NEXT_DEPLOYMENT_ID'] = userConfiguredDeploymentId
    return userConfiguredDeploymentId
  }

  return process.env['NEXT_DEPLOYMENT_ID'] || ''
}
