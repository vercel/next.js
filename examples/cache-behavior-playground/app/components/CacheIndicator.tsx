'use client'

interface CacheIndicatorProps {
  generatedAt: number
  receivedAt: number
  staleWindow?: number // seconds
}

export function CacheIndicator({
  generatedAt,
  receivedAt,
  staleWindow = 1,
}: CacheIndicatorProps) {
  const age = receivedAt - generatedAt
  const ageSeconds = age / 1000

  let status: 'fresh' | 'stale' | 'miss' | 'regenerating'
  let label: string

  if (ageSeconds < staleWindow) {
    status = 'fresh'
    label = `Fresh (${ageSeconds.toFixed(2)}s ago)`
  } else if (ageSeconds < staleWindow * 60) {
    status = 'stale'
    label = `Stale (${ageSeconds.toFixed(1)}s ago)`
  } else {
    status = 'miss'
    label = `Old (${Math.floor(ageSeconds / 60)}m ago)`
  }

  return (
    <div className={`cache-indicator ${status}`}>
      <span className="dot">●</span>
      <span>{label}</span>
    </div>
  )
}
