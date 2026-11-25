import type { Instrumentation } from 'next'
import { getOrigin } from './origin'

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  if (
    !/^\/(?:partial\/(?:suspense-)?)?(?:reported|transient)-/.test(request.path)
  ) {
    return
  }

  if (request.path.startsWith('/reported-blocked-')) {
    const started = await fetch(
      `${getOrigin()}/test-data?key=${encodeURIComponent(`started-${request.path}`)}`,
      { method: 'POST', body: 'started' }
    )
    if (!started.ok) {
      throw new Error(`Failed to record hook start: ${started.status}`)
    }

    // The test releases this hook only after receiving the recovery response.
    // Poll shared data so separate deployment invocations can coordinate.
    const timeoutSignal = AbortSignal.timeout(60_000)
    while (true) {
      // Each fetch gets its own signal so its abort listeners do not
      // accumulate.
      const release = await fetch(
        `${getOrigin()}/test-data?key=${encodeURIComponent(`release-${request.path}`)}`,
        { cache: 'no-store', signal: AbortSignal.any([timeoutSignal]) }
      )
      const value = await release.text()
      if (release.ok && value === 'released') {
        break
      }
    }
  }

  const response = await fetch(
    `${getOrigin()}/test-data?key=${encodeURIComponent(`report-${request.path}`)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        request: { path: request.path, method: request.method },
        context,
      }),
    }
  )
  if (!response.ok) {
    throw new Error(`Failed to record the request error: ${response.status}`)
  }
}
