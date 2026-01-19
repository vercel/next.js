// This could also be a variable instead of a function, but some unit tests want to change the ID at
// runtime. Even though that would never happen in a real deployment.
export function getDeploymentId(): string | undefined {
  if (typeof document !== 'undefined') {
    return document.documentElement.dataset.dplId
  }
  // build/define-env.ts might replace this with "false"
  return process.env.NEXT_DEPLOYMENT_ID || undefined
}

export function getDeploymentIdQueryOrEmptyString(): string {
  let deploymentId = getDeploymentId()
  if (deploymentId) {
    return `?dpl=${deploymentId}`
  }
  return ''
}
