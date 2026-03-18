let deploymentId: string | undefined

if (typeof window !== 'undefined') {
  deploymentId = document.documentElement.dataset.dplId
  // Immediately remove the attribute to prevent hydration errors (the dplId was inserted into the
  // HTML only), React isn't aware of it at all.
  delete document.documentElement.dataset.dplId
} else {
  // Client side: replaced with globalThis.NEXT_DEPLOYMENT_ID
  // Server side: left as is or replaced with a string or replaced with false
  deploymentId = process.env.NEXT_DEPLOYMENT_ID || undefined
}

export function getDeploymentId(): string | undefined {
  return deploymentId
}

export function getDeploymentIdQuery(ampersand = false): string {
  let id = getDeploymentId()
  if (id) {
    return `${ampersand ? '&' : '?'}dpl=${id}`
  }
  return ''
}

export function getAssetToken(): string | undefined {
  return (
    process.env.NEXT_IMMUTABLE_ASSET_TOKEN || process.env.NEXT_DEPLOYMENT_ID
  )
}

export function getAssetTokenQuery(ampersand = false): string {
  let id = getAssetToken()
  if (id) {
    return `${ampersand ? '&' : '?'}dpl=${id}`
  }
  return ''
}
