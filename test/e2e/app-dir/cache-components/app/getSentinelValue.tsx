const { PHASE_PRODUCTION_BUILD } = require('next/constants')

export function getSentinelValue() {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? 'at buildtime'
    : 'at runtime'
}

export function SentinelValue() {
  return getSentinelValue()
}
