import { printAndExit } from '../server/lib/utils'

export type NextDiagnoseOptions = {
  url?: string
  json?: boolean
}

export async function nextDiagnose(options: NextDiagnoseOptions) {
  const devServerUrl = normalizeDevServerUrl(
    options.url ?? 'http://localhost:3000'
  )
  const endpoint = new URL('/__nextjs_request_insights', devServerUrl)

  const response = await fetch(endpoint).catch((error) => {
    printAndExit(
      `Failed to reach ${endpoint.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      1
    )
    throw error
  })

  const text = await response.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    printAndExit(`Invalid response from ${endpoint.toString()}: ${text}`, 1)
  }

  if (!response.ok) {
    printAndExit(data?.error ?? `Request failed with ${response.status}`, 1)
  }

  if (options.json) {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  const requests = Array.isArray(data.requests) ? data.requests : []
  if (requests.length === 0) {
    console.log('No request insights captured yet.')
    return
  }

  for (const request of requests.slice(-20).reverse()) {
    const route = request.route ?? request.url ?? request.requestId
    const duration = formatDuration(request.durationMs)
    const fetches = Array.isArray(request.fetches) ? request.fetches : []
    console.log(`${route} ${duration} ${request.status ?? 'pending'}`)
    console.log(
      `  request ${shortId(request.requestId)} page ${shortId(request.htmlRequestId)}`
    )

    for (const fetch of fetches.slice(0, 5)) {
      console.log(
        `  fetch ${formatDuration(fetch.durationMs)} ${fetch.statusCode ?? '-'} ${fetch.cacheStatus ?? 'unknown'} ${fetch.method ?? 'GET'} ${fetch.url ?? ''}`
      )
    }
  }
}

function normalizeDevServerUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    return new URL(`http://${value}`)
  }
}

function formatDuration(durationMs: number | undefined): string {
  if (typeof durationMs !== 'number') {
    return '-'
  }

  return durationMs < 1000
    ? `${Math.round(durationMs)}ms`
    : `${(durationMs / 1000).toFixed(2)}s`
}

function shortId(id: string | undefined): string {
  if (!id) {
    return '-'
  }

  return id.length > 8 ? id.slice(0, 8) : id
}
