import type { LightningCssFeature } from '../../../../../server/config-shared'

/**
 * Maps feature names to lightningcss `Features` bitmask values.
 * Bit positions must match the Rust `lightningcss::targets::Features` bitflags.
 */
const FEATURE_MAP: Record<LightningCssFeature, number> = {
  nesting: 1 << 0,
  'not-selector-list': 1 << 1,
  'dir-selector': 1 << 2,
  'lang-selector-list': 1 << 3,
  'is-selector': 1 << 4,
  'text-decoration-thickness-percent': 1 << 5,
  'media-interval-syntax': 1 << 6,
  'media-range-syntax': 1 << 7,
  'custom-media-queries': 1 << 8,
  'clamp-function': 1 << 9,
  'color-function': 1 << 10,
  'oklab-colors': 1 << 11,
  'lab-colors': 1 << 12,
  'p3-colors': 1 << 13,
  'hex-alpha-colors': 1 << 14,
  'space-separated-color-notation': 1 << 15,
  'font-family-system-ui': 1 << 16,
  'double-position-gradients': 1 << 17,
  'vendor-prefixes': 1 << 18,
  'logical-properties': 1 << 19,
  'light-dark': 1 << 20,
  // Composites
  selectors: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4),
  'media-queries': (1 << 6) | (1 << 7) | (1 << 8),
  colors:
    (1 << 10) |
    (1 << 11) |
    (1 << 12) |
    (1 << 13) |
    (1 << 14) |
    (1 << 15) |
    (1 << 20),
}

/** Convert an array of feature names into a combined bitmask. */
export function featureNamesToMask(names: LightningCssFeature[]): number {
  let mask = 0
  for (const name of names) {
    mask |= FEATURE_MAP[name]
  }
  return mask
}
