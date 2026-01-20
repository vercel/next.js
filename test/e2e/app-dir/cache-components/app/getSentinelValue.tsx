import {
  PHASE_PRODUCTION_BUILD,
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants'

export function getSentinelValue() {
  const phase = process.env.NEXT_PHASE
  switch (phase) {
    case PHASE_PRODUCTION_BUILD:
      return 'at buildtime'
    case PHASE_DEVELOPMENT_SERVER:
    case PHASE_PRODUCTION_SERVER:
      return 'at runtime'
    default:
      return `at ${phase}`
  }
}

export function SentinelValue() {
  return getSentinelValue()
}
