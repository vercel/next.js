/**
 * Generates a deployment ID from a user-provided string or auto-generates one
 * if the experimental flag is enabled.
 */
export function generateDeploymentId(
  deploymentId: string | undefined,
  autoGenerate: boolean,
  generateFn: () => string
): string {
  if (autoGenerate) {
    // Auto-generate a unique deployment ID
    return generateFn()
  }

  if (!deploymentId) {
    return ''
  }

  return deploymentId.trim()
}

