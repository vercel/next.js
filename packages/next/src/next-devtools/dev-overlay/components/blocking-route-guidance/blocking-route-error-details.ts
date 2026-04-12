export type BlockingRouteErrorDetails = {
  type: 'blocking-route'
  variant: 'navigation' | 'runtime'
  refinement: '' | 'generateViewport'
}

export type DynamicMetadataErrorDetails = {
  type: 'dynamic-metadata'
  variant: 'navigation' | 'runtime'
}

export type SyncIOErrorDetails = {
  type: 'sync-io'
  apiType: 'time' | 'random' | 'crypto'
  context: 'server' | 'client'
}

function isRuntimeVariant(message: string): boolean {
  if (message.includes('Runtime data')) return true
  if (
    message.includes('A request-time API') &&
    !message.includes('Uncached data or a request-time API')
  ) {
    return true
  }
  return false
}

export function getBlockingRouteErrorDetails(
  error: Error
): BlockingRouteErrorDetails | null {
  const isBlockingPageLoadError = error.message.includes('/blocking-route')

  if (isBlockingPageLoadError) {
    return {
      type: 'blocking-route',
      variant: isRuntimeVariant(error.message) ? 'runtime' : 'navigation',
      refinement: '',
    }
  }

  const isBlockingViewportError = error.message.includes(
    '/next-prerender-dynamic-viewport'
  )
  if (isBlockingViewportError) {
    return {
      type: 'blocking-route',
      variant: isRuntimeVariant(error.message) ? 'runtime' : 'navigation',
      refinement: 'generateViewport',
    }
  }

  return null
}

export function getDynamicMetadataErrorDetails(
  error: Error
): DynamicMetadataErrorDetails | null {
  if (!error.message.includes('/next-prerender-dynamic-metadata')) {
    return null
  }

  return {
    type: 'dynamic-metadata',
    variant: isRuntimeVariant(error.message) ? 'runtime' : 'navigation',
  }
}

export function getSyncIOErrorDetails(error: Error): SyncIOErrorDetails | null {
  const msg = error.message

  let apiType: SyncIOErrorDetails['apiType'] | null = null
  if (
    msg.includes('/next-prerender-current-time') ||
    msg.includes('/next-prerender-runtime-current-time')
  ) {
    apiType = 'time'
  } else if (
    msg.includes('/next-prerender-random') ||
    msg.includes('/next-prerender-runtime-random')
  ) {
    apiType = 'random'
  } else if (
    msg.includes('/next-prerender-crypto') ||
    msg.includes('/next-prerender-runtime-crypto')
  ) {
    apiType = 'crypto'
  }

  if (apiType === null) {
    return null
  }

  const context: SyncIOErrorDetails['context'] = msg.includes('-client')
    ? 'client'
    : 'server'

  return { type: 'sync-io', apiType, context }
}
