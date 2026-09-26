// This module is imported by the root layout, the nested layout and both
// sibling pages. The layout segment chunking optimization gives each nested
// segment the availability info of its parent, so a module already present in
// an ancestor segment's chunks must not be emitted again into the chunks of a
// descendant segment.
//
// The marker below is therefore expected to appear in exactly one emitted
// server chunk. If chunk sharing across layout segments regresses, the module
// is duplicated into each segment's chunks and the marker shows up in several.
export const LAYOUT_SEGMENT_SHARED_MARKER =
  'layout-segment-shared-marker-3f9a1c7e'

export function sharedLayoutValue(prefix: string): string {
  return `${prefix}:${LAYOUT_SEGMENT_SHARED_MARKER}`
}
