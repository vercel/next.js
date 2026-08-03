'use client'
// Entry into the docs slice of the generated client graph (see
// scripts/generate-client-graph.mjs); models the shared foundation chunks
// a docs route's client components sit on.
import { docsSliceProbe } from './vendor/slice-docs'

export function describeDocsVendor(seed) {
  return docsSliceProbe(seed ?? 1)
}
