import { parse, sep } from 'node:path'
import { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import { getClientReferenceModuleKey } from '../../lib/client-reference'

/**
 * Get external stylesheet link hrefs based on server CSS manifest.
 */
export function getCssInlinedLinkTags(
  clientReferenceManifest: ClientReferenceManifest,
  filePath: string,
  injectedCSS: Set<string>,
  collectNewCSSImports?: boolean
): string[] {
  const parsedFilepath = parse(filePath)
  const filePathWithoutExt = parsedFilepath.dir + sep + parsedFilepath.name

  const chunks = new Set<string>()

  const entryCSSFiles =
    clientReferenceManifest.entryCSSFiles[filePathWithoutExt]
  if (entryCSSFiles) {
    for (const file of entryCSSFiles.files) {
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
