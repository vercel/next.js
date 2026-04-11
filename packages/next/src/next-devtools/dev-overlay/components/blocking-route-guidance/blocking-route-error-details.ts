export type BlockingRouteErrorDetails = {
  type: 'blocking-route'
  variant: 'navigation' | 'runtime'
  refinement: '' | 'generateViewport'
  apiName: string | null
}

function isRuntimeVariant(message: string): boolean {
  if (message.includes('Runtime data')) return true
  if (message.includes('A request-time API') && !message.includes('Either')) {
    return true
  }
  return false
}

const API_PATTERNS = [
  /it used [`']?([a-zA-Z]+\(\))[`']?/,
  /it used [`']?([a-zA-Z]+)[`']?\./,
  /such as [`']?([a-zA-Z]+\(\))[`']?/,
]

function extractApiName(message: string): string | null {
  for (const pattern of API_PATTERNS) {
    const match = message.match(pattern)
    if (match) return match[1]
  }
  return null
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
      apiName: extractApiName(error.message),
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
      apiName: extractApiName(error.message),
    }
  }

  return null
}
