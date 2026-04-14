export type BlockingRouteErrorDetails = {
  type: 'blocking-route'
  variant: 'navigation' | 'runtime'
  refinement: '' | 'generateViewport'
}

export type DynamicMetadataErrorDetails = {
  type: 'dynamic-metadata'
  variant: 'navigation' | 'runtime'
}

function isRuntimeVariant(message: string): boolean {
  return (
    message.includes('request-time API') ||
    message.includes('cookies()') ||
    message.includes('Runtime data')
  )
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
