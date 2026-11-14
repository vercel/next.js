import type { CssResource } from '../../build/webpack/plugins/flight-manifest-plugin'
import { getClientReferenceManifest } from './manifests-singleton'

const EMPTY_SET: ReadonlySet<never> = new Set()

/**
 * Get external stylesheet link hrefs based on server CSS manifest.
 */
export function getLinkAndScriptTags(
  filePath: string,
  injectedCSS: Set<string>,
  injectedScripts: Set<string>,
  collectNewImports?: boolean
): { styles: ReadonlySet<CssResource>; scripts: ReadonlySet<string> } {
  const filePathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  let cssChunks: Set<CssResource> | undefined
  let jsChunks: Set<string> | undefined
  const { entryCSSFiles, entryJSFiles } = getClientReferenceManifest()
  const cssFiles = entryCSSFiles[filePathWithoutExt]
  const jsFiles = entryJSFiles?.[filePathWithoutExt]

  if (cssFiles) {
    for (const css of cssFiles) {
      if (!injectedCSS.has(css.path)) {
        if (collectNewImports) {
          injectedCSS.add(css.path)
        }
        if (!cssChunks) {
          cssChunks = new Set()
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
        if (!jsChunks) {
          jsChunks = new Set()
        }
        jsChunks.add(file)
      }
    }
  }

  return {
    styles: cssChunks ?? EMPTY_SET,
    scripts: jsChunks ?? EMPTY_SET,
  }
}
