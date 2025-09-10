import type { NextConfig } from '../../server/config-shared'

/**
 * Find the closest matching `quality` in the list of `config.qualities`
 * @param quality the quality prop passed to the image component
 * @param config the "images" configuration from next.config.js
 * @returns the closest matching quality value
 */
export function findClosestQuality(
  quality: number | undefined,
  config: NextConfig['images'] | undefined
): number {
  const q = quality || 75
  if (!config?.qualities?.length) {
    return q
  }
  return config.qualities.reduce(
    (prev, cur) => (Math.abs(cur - q) < Math.abs(prev - q) ? cur : prev),
    0
  )
}
