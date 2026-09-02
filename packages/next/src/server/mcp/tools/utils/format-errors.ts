import type { SerializedOverlayState } from '../../../../next-devtools/dev-overlay.browser'
import type { FormattedRuntimeError } from '../../../dev/hot-reloader-types'
import { formatRuntimeErrors } from '../../../dev/runtime-error-state'

interface FormattedSessionError {
  url: string
  buildError: string | null
  runtimeErrors: FormattedRuntimeError[]
}

interface FormattedConfigError {
  name: string
  message: string
  stack: string | null
}

export interface FormattedErrorsOutput {
  configErrors: FormattedConfigError[]
  sessionErrors: FormattedSessionError[]
}

export async function formatErrors(
  errorsByUrl: Map<string, SerializedOverlayState>,
  nextInstanceErrors: { nextConfig: unknown[] } = { nextConfig: [] }
): Promise<FormattedErrorsOutput> {
  const output: FormattedErrorsOutput = {
    configErrors: [],
    sessionErrors: [],
  }

  // Format Next.js instance errors first (e.g., next.config.js errors)
  for (const error of nextInstanceErrors.nextConfig) {
    if (error instanceof Error) {
      output.configErrors.push({
        name: error.name,
        message: error.message,
        stack: error.stack || null,
      })
    } else {
      output.configErrors.push({
        name: 'Error',
        message: String(error),
        stack: null,
      })
    }
  }

  // Format browser session errors
  for (const [url, overlayState] of errorsByUrl) {
    const totalErrorCount =
      overlayState.errors.length + (overlayState.buildError ? 1 : 0)

    if (totalErrorCount === 0) continue

    let displayUrl = url
    try {
      const urlObj = new URL(url)
      displayUrl = urlObj.pathname + urlObj.search + urlObj.hash
    } catch {
      // If URL parsing fails, use the original URL
    }

    const runtimeErrors = await formatRuntimeErrors(
      overlayState.errors,
      overlayState.routerType === 'app'
    )

    output.sessionErrors.push({
      url: displayUrl,
      buildError: overlayState.buildError || null,
      runtimeErrors,
    })
  }

  return output
}
