const { PHASE_PRODUCTION_BUILD } = require('next/constants')

export function getSentinelValue() {
  if (typeof process === 'object') {
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
      return 'at buildtime'
    }
  }
  return 'at runtime'
}

export function LayoutSentinel() {
  return <div id="layout">{getSentinelValue()}</div>
}

export function PageSentinel() {
  return <div id="page">{getSentinelValue()}</div>
}

export function InnerSentinel() {
  return <div id="inner">{getSentinelValue()}</div>
}
