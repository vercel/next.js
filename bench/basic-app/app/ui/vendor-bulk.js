'use client'
// Entry into the generated bulk client graph (see
// scripts/generate-client-graph.mjs); gives client-reference closures the
// weight of a large deployment's shared vendor code.
import { graphProbe } from './vendor'

export function describeBulkGraph(seed) {
  return graphProbe(seed ?? 1)
}
