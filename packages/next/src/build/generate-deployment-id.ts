type DeploymentIdSource = 'user-config' | 'env-var'

/**
 * Resolves and sets the deployment ID from config, handling precedence.
 * User-configured deploymentId always takes precedence over NEXT_DEPLOYMENT_ID.
 *
 * @param configDeploymentId - The deploymentId from config (string or undefined)
 * @param source - Source indicator: 'user-config' treats as user-configured (validates), 'env-var' uses NEXT_DEPLOYMENT_ID
 * @param fallbackDeploymentId - Optional fallback deployment ID to use if process.env.NEXT_DEPLOYMENT_ID is empty
 * @returns The resolved deploymentId string to use
 */
export function resolveAndSetDeploymentId(
  configDeploymentId: string | undefined,
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
      // Don't validate environment variables, only user-provided config values
      process.env['NEXT_DEPLOYMENT_ID'] = envDeploymentId
      return envDeploymentId
    }
    return ''
  }

  const userConfiguredDeploymentId = configDeploymentId

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
