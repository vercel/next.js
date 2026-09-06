'use client'
// Entry into the blog slice of the generated client graph (see
// scripts/generate-client-graph.mjs); models the shared foundation chunks
// a marketing route's client components sit on.
import { blogSliceProbe } from './vendor/slice-blog'

export function describeBlogVendor(seed) {
  return blogSliceProbe(seed ?? 1)
}
