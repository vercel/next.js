/**
 * Returns the deployment ID string, or empty string if undefined.
 * This file is safe to use in edge runtime - it does NOT modify process.env.
 */
export function evaluateDeploymentId(
  deploymentId: string | undefined | null
): string {
  if (typeof deploymentId === 'string') {
    return deploymentId
  }
  return ''
}
