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
 * @param fallbackDeploymentId - Optional fallback deployment ID to use if process.env.NEXT_DEPLOYMENT_ID is empty
 * @returns The resolved deploymentId string to use
 */
export function resolveAndSetDeploymentId(
  configDeploymentId: string | (() => string) | undefined,
  source: DeploymentIdSource,
  fallbackDeploymentId?: string
): string {
  if (source === 'env-var') {
    // Prefer fallbackDeploymentId (from combinedEnv) over process.env since
    // loadEnvConfig may have reset process.env
    let envDeploymentId =
      fallbackDeploymentId || process.env['NEXT_DEPLOYMENT_ID'] || ''

    if (
      envDeploymentId &&
      envDeploymentId !== process.env['NEXT_DEPLOYMENT_ID']
    ) {
      process.env['NEXT_DEPLOYMENT_ID'] = envDeploymentId
    }
    if (envDeploymentId.length > 0) {
      if (envDeploymentId.length > 32) {
        throw new Error(
          `The deploymentId "${envDeploymentId}" exceeds the maximum length of 32 characters. Please choose a shorter deploymentId. https://nextjs.org/docs/messages/deploymentid-too-long`
        )
      }
      const validCharacterPattern = /^[a-zA-Z0-9_-]+$/
      if (!validCharacterPattern.test(envDeploymentId)) {
        throw new Error(
          `The deploymentId "${envDeploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed. https://nextjs.org/docs/messages/deploymentid-invalid-characters`
        )
      }
      process.env['NEXT_DEPLOYMENT_ID'] = envDeploymentId
      return envDeploymentId
    }
    return ''
  }

  let userConfiguredDeploymentId: string | undefined
  if (typeof configDeploymentId === 'string') {
    userConfiguredDeploymentId = configDeploymentId
  } else if (typeof configDeploymentId === 'function') {
    userConfiguredDeploymentId = generateDeploymentId(configDeploymentId)
  }

  if (userConfiguredDeploymentId !== undefined) {
    if (userConfiguredDeploymentId.length === 0) {
      return process.env['NEXT_DEPLOYMENT_ID'] || ''
    }

    if (userConfiguredDeploymentId.length > 32) {
      throw new Error(
        `The deploymentId "${userConfiguredDeploymentId}" exceeds the maximum length of 32 characters. Please choose a shorter deploymentId. https://nextjs.org/docs/messages/deploymentid-too-long`
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
