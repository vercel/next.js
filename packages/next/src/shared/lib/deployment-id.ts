export let deploymentId: string | undefined = process.env.NEXT_DEPLOYMENT_ID

export function getDeploymentIdQueryOrEmptyString(): string {
  if (deploymentId) {
    return `?dpl=${deploymentId}`
  }
  return ''
}
