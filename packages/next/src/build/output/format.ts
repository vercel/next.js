import type { CacheControl } from '../../server/lib/cache-control'

const timeUnits = [
  { label: 'y', seconds: 31536000 },
  { label: 'w', seconds: 604800 },
  { label: 'd', seconds: 86400 },
  { label: 'h', seconds: 3600 },
  { label: 'm', seconds: 60 },
  { label: 's', seconds: 1 },
]

function humanReadableTimeRounded(seconds: number): string {
  // Find the largest fitting unit.
  let candidateIndex = timeUnits.length - 1
  for (let i = 0; i < timeUnits.length; i++) {
    if (seconds >= timeUnits[i].seconds) {
      candidateIndex = i
      break
    }
  }

  const candidate = timeUnits[candidateIndex]
  const value = seconds / candidate.seconds
  const isExact = Number.isInteger(value)

  // For days and weeks only, check if using the next smaller unit yields an
  // exact result.
  if (!isExact && (candidate.label === 'd' || candidate.label === 'w')) {
    const nextUnit = timeUnits[candidateIndex + 1]
    const nextValue = seconds / nextUnit.seconds

    if (Number.isInteger(nextValue)) {
      return `${nextValue}${nextUnit.label}`
    }
  }

  if (isExact) {
    return `${value}${candidate.label}`
  }

  return `≈${Math.round(value)}${candidate.label}`
}

export function formatRevalidate(cacheControl: CacheControl): string {
  const { revalidate } = cacheControl

  return revalidate ? humanReadableTimeRounded(revalidate) : ''
}

export function formatExpire(cacheControl: CacheControl): string {
  const { expire } = cacheControl

  return expire ? humanReadableTimeRounded(expire) : ''
}
