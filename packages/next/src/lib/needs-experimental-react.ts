import type { NextConfig } from '../server/config-shared'

export function needsExperimentalReact(config: NextConfig) {
  const { taint, viewTransition } = config.experimental || {}
  return Boolean(taint || viewTransition)
}
