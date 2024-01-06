import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'

/**
 * Get hrefs for fonts to preload
 * Returns null if there are no fonts at all.
 * Returns string[] if there are fonts to preload (font paths)
 * Returns empty string[] if there are fonts but none to preload and no other fonts have been preloaded
 * Returns null if there are fonts but none to preload and at least some were previously preloaded
 */
export function getPreloadableFonts(
  nextFontManifest: NextFontManifest | undefined,
  filePath: string | undefined,
  injectedFontPreloadTags: Set<string>
): string[] | null {
  if (!nextFontManifest || !filePath) {
    return null
  }
  const filepathWithoutExtension = filePath.replace(/\.[^.]+$/, '')
  const fontFiles = new Set<string>()
  let foundFontUsage = false

  const preloadedFontFiles = nextFontManifest.app[filepathWithoutExtension]
  if (preloadedFontFiles) {
    foundFontUsage = true
    for (const fontFile of preloadedFontFiles) {
      if (!injectedFontPreloadTags.has(fontFile)) {
        fontFiles.add(fontFile)
        injectedFontPreloadTags.add(fontFile)
      }
    }
  }

  if (fontFiles.size) {
    return [...fontFiles].sort()
  } else if (foundFontUsage && injectedFontPreloadTags.size === 0) {
    return []
  } else {
    return null
  }
}
