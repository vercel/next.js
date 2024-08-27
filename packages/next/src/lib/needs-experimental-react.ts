import type { NextConfig } from '../server/config-shared'

export function needsExperimentalReact(config: NextConfig) {
  const { ppr, taint, dynamicIO, reactOwnerStack } = config.experimental || {}
  return Boolean(ppr || taint || dynamicIO || reactOwnerStack)
}
