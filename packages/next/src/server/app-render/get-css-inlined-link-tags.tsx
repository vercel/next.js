import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

/**
 * Get external stylesheet link hrefs based on server CSS manifest.
 */
export function getCssInlinedLinkTags(
  clientReferenceManifest: ClientReferenceManifest,
  filePath: string,
  injectedCSS: Set<string>,
  collectNewCSSImports?: boolean
): string[] {
  const filePathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  const chunks = new Set<string>()

  const entryCSSFiles =
    clientReferenceManifest.entryCSSFiles[filePathWithoutExt]

  if (entryCSSFiles) {
    for (const file of entryCSSFiles) {
      if (!injectedCSS.has(file)) {
        if (collectNewCSSImports) {
          injectedCSS.add(file)
        }
        chunks.add(file)
      }
    }
  }

  return [...chunks]
}
