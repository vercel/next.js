import type {
  RequestInsight,
  RequestInsightsCaptureState,
  RequestInsightsSnapshot,
} from '../../../shared/request-insights'

export function getCaptureOmissionPresentation(
  requests: readonly RequestInsight[],
  projection: RequestInsightsSnapshot['projection']
): { accessibleLabel: string; detail: string } | undefined {
  const omittedRequestGroupCount = projection?.omittedRequestGroupCount ?? 0
  const omittedRequestCount = requests.reduce(
    (total, request) => total + (request.omittedRequestCount ?? 0),
    0
  )
  const omittedParts = [
    formatOmittedCount(
      omittedRequestGroupCount,
      'request group',
      'request groups'
    ),
    formatOmittedCount(
      omittedRequestCount,
      'related request',
      'related requests'
    ),
  ].filter((part): part is string => part !== undefined)

  if (omittedParts.length === 0) return undefined

  const detail = `${omittedParts.join(' and ')} ${
    omittedParts.length === 1 &&
    omittedRequestGroupCount + omittedRequestCount === 1
      ? "isn't"
      : "aren't"
  } shown because capture limits were reached.`

  return { accessibleLabel: detail, detail }
}

export function getCaptureUsagePresentation(
  capture: RequestInsightsCaptureState
): {
  accessibleLabel: string
  detail: string
  max: number
  percentage: number
  value: number
} {
  const maxGroups = capture.limits.maxRequestGroupsPerBucket
  const candidates: Array<{
    accessibleLabel: string
    detail: string
    max: number
    percentage: number
    value: number
  }> = []

  const globalBytePercentage =
    capture.limits.maxRetainedBytes > 0
      ? (capture.usage.retainedBytes / capture.limits.maxRetainedBytes) * 100
      : 0
  candidates.push({
    accessibleLabel: `Total byte usage: ${formatBytes(capture.usage.retainedBytes)} of ${formatBytes(capture.limits.maxRetainedBytes)}`,
    detail: `Total ${formatBytes(capture.usage.retainedBytes)} of ${formatBytes(capture.limits.maxRetainedBytes)}`,
    max: capture.limits.maxRetainedBytes,
    percentage: globalBytePercentage,
    value: capture.usage.retainedBytes,
  })

  for (const bucket of capture.usage.buckets) {
    const label = formatRetentionBucket(bucket.bucket)
    const groupPercentage =
      maxGroups > 0 ? (bucket.retainedRequestGroupCount / maxGroups) * 100 : 0
    candidates.push({
      accessibleLabel: `${label} group usage: ${bucket.retainedRequestGroupCount} of ${maxGroups}`,
      detail: `${label} groups ${bucket.retainedRequestGroupCount} of ${maxGroups}`,
      max: maxGroups,
      percentage: groupPercentage,
      value: bucket.retainedRequestGroupCount,
    })

    const bucketBytePercentage =
      capture.limits.maxBytesPerBucket > 0
        ? (bucket.retainedBytes / capture.limits.maxBytesPerBucket) * 100
        : 0
    candidates.push({
      accessibleLabel: `${label} byte usage: ${formatBytes(bucket.retainedBytes)} of ${formatBytes(capture.limits.maxBytesPerBucket)}`,
      detail: `${label} bytes ${formatBytes(bucket.retainedBytes)} of ${formatBytes(capture.limits.maxBytesPerBucket)}`,
      max: capture.limits.maxBytesPerBucket,
      percentage: bucketBytePercentage,
      value: bucket.retainedBytes,
    })
  }

  const mostConstrained = candidates.reduce((current, candidate) =>
    candidate.percentage > current.percentage ? candidate : current
  )
  return {
    ...mostConstrained,
    percentage: clampPercentage(mostConstrained.percentage),
  }
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`
}

function formatRetentionBucket(bucket: string): string {
  switch (bucket) {
    case 'page':
      return 'Pages'
    case 'api':
      return 'API'
    case 'asset':
      return 'Assets'
    case 'proxy':
      return 'Proxy'
    case 'instant-insights':
      return 'Instant Insights'
    default:
      return 'Unknown'
  }
}

function formatOmittedCount(
  count: number,
  singular: string,
  plural: string
): string | undefined {
  if (count <= 0) return undefined
  return `${count} ${count === 1 ? singular : plural}`
}
