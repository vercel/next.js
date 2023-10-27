import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

/**
 * Get external stylesheet link hrefs based on server CSS manifest.
 */
export function getLinkAndScriptTags(
  clientReferenceManifest: ClientReferenceManifest,
  filePath: string,
  injectedCSS: Set<string>,
  injectedScripts: Set<string>,
  collectNewImports?: boolean
): { styles: string[]; scripts: string[] } {
  const filePathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  const cssChunks = new Set<string>()
  const jsChunks = new Set<string>()

  const entryCSSFiles =
    clientReferenceManifest.entryCSSFiles[filePathWithoutExt]
  const entryJSFiles =
    clientReferenceManifest.entryJSFiles?.[filePathWithoutExt] ?? []

  if (entryCSSFiles) {
    for (const file of entryCSSFiles) {
      if (!injectedCSS.has(file)) {
        if (collectNewImports) {
          injectedCSS.add(file)
        }
        cssChunks.add(file)
      }
    }
  }

  if (entryJSFiles) {
    for (const file of entryJSFiles) {
      if (!injectedScripts.has(file)) {
        if (collectNewImports) {
          injectedScripts.add(file)
        }
        jsChunks.add(file)
      }
    }
  }

  return { styles: [...cssChunks], scripts: [...jsChunks] }
}
