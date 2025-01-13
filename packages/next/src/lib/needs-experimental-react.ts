import type { NextConfig } from '../server/config-shared'

export function needsExperimentalReact(config: NextConfig) {
  const { ppr, taint, reactOwnerStack, viewTransition } =
    config.experimental || {}
  return Boolean(ppr || taint || reactOwnerStack || viewTransition)
}
