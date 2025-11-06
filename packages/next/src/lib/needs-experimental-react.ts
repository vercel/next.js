import type { NextConfig } from '../server/config-shared'

// Keep in sync with Turbopack's experimental React switch: file://./../../../../crates/next-core/src/next_import_map.rs
export function needsExperimentalReact(config: NextConfig) {
  const { taint } = config.experimental || {}
  return Boolean(taint)
}
