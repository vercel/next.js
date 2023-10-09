export function getDeploymentIdQueryOrEmptyString(): string {
  if (process.env.NEXT_DEPLOYMENT_ID) {
    return `?dpl=${process.env.NEXT_DEPLOYMENT_ID}`
  }
  return ''
}
