export type BlockingRouteErrorDetails = {
  type: 'blocking-route'
  variant: 'navigation' | 'runtime'
  refinement: '' | 'generateViewport'
  apiName: string | null
}

function isRuntimeVariant(message: string): boolean {
  return (
    message.includes('request-time API') ||
    message.includes('cookies()') ||
    message.includes('Runtime data')
  )
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
