import type { NextConfig } from '../server/config-shared'

export function needsExperimentalReact(config: NextConfig) {
  const { ppr, taint, viewTransition } = config.experimental || {}
  return Boolean(ppr || taint || viewTransition)
}
