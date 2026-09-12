import type { NextConfig } from '../server/config-shared'

// Keep in sync with Turbopack's experimental React switch: file://./../../../../crates/next-core/src/next_config.rs
export function needsExperimentalReact(config: NextConfig) {
  const {
    blockingSSR,
    taint,
    transitionIndicator,
    gestureTransition,
    ledgers,
  } = config.experimental || {}
  return Boolean(
    blockingSSR || taint || transitionIndicator || gestureTransition || ledgers
  )
}
