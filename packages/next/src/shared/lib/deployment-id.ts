// This could also be a variable instead of a function, but some unit tests want to change the ID at
// runtime. Even though that would never happen in a real deployment.
export function getDeploymentId(): string | undefined {
  return (
    process.env.NEXT_DEPLOYMENT_ID ??
    process.env.NEXT_DEPLOYMENT_ID_COMPILE_TIME
  )
}

export function getDeploymentIdQueryOrEmptyString(): string {
  let deploymentId = getDeploymentId()
  if (deploymentId) {
    return `?dpl=${deploymentId}`
  }
  return ''
}
