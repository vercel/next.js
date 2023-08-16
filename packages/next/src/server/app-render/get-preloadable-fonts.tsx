import { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

/**
 * Get hrefs for fonts to preload
 * Returns null if there are no fonts at all.
 * Returns string[] if there are fonts to preload (font paths)
 * Returns empty string[] if there are fonts but none to preload and no other fonts have been preloaded
 * Returns null if there are fonts but none to preload and at least some were previously preloaded
 */
export function getPreloadableFonts(
  clientReferenceManifest: ClientReferenceManifest,
  nextFontManifest: NextFontManifest | undefined,
  filePath: string | undefined,
  injectedFontPreloadTags: Set<string>
): string[] | null {
  if (!nextFontManifest || !filePath) {
    return null
  }
  const filepathWithoutExtension = filePath.replace(/\.[^.]+$/, '')
  const entryCSS =
    clientReferenceManifest.entryCSSFiles[filepathWithoutExtension]

  if (!entryCSS) {
    return null
  }

  const fontFiles = new Set<string>()
  let foundFontUsage = false

  for (const cssModules of entryCSS.modules) {
    const preloadedFontFiles = nextFontManifest.app[cssModules]
    if (preloadedFontFiles) {
      foundFontUsage = true
      for (const fontFile of preloadedFontFiles) {
        if (!injectedFontPreloadTags.has(fontFile)) {
          fontFiles.add(fontFile)
          injectedFontPreloadTags.add(fontFile)
        }
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
