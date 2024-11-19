import type {
  ClientReferenceManifest,
  CssResource,
} from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

/**
 * Get external stylesheet link hrefs based on server CSS manifest.
 */
export function getLinkAndScriptTags(
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  filePath: string,
  injectedCSS: Set<CssResource>,
  injectedScripts: Set<string>,
  collectNewImports?: boolean
): { styles: CssResource[]; scripts: string[] } {
  const filePathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  const cssChunks = new Set<CssResource>()
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
