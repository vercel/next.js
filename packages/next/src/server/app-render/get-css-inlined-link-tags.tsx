import type { CssResource } from '../../build/webpack/plugins/flight-manifest-plugin'
import { getClientReferenceManifest } from './manifests-singleton'

/**
 * Get external stylesheet link hrefs based on server CSS manifest.
 */
export function getLinkAndScriptTags(
  filePath: string,
  injectedCSS: Set<string>,
  injectedScripts: Set<string>,
  collectNewImports?: boolean
): { styles: CssResource[]; scripts: string[] } {
  const filePathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  const cssChunks = new Set<CssResource>()
  const jsChunks = new Set<string>()
  const { entryCSSFiles, entryJSFiles } = getClientReferenceManifest()
  const cssFiles = entryCSSFiles[filePathWithoutExt]
  const jsFiles = entryJSFiles?.[filePathWithoutExt]

  if (cssFiles) {
    for (const css of cssFiles) {
      if (!injectedCSS.has(css.path)) {
        if (collectNewImports) {
          injectedCSS.add(css.path)
        }
        cssChunks.add(css)
      }
    }
  }

  if (jsFiles) {
    for (const file of jsFiles) {
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
