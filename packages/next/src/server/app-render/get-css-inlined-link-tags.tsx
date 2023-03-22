import {
  ClientCSSReferenceManifest,
  ClientReferenceManifest,
} from '../../build/webpack/plugins/flight-manifest-plugin'
import { getClientReferenceModuleKey } from '../../lib/client-reference'

/**
 * Get inline <link> tags based on server CSS manifest. Only used when rendering to HTML.
 */
export function getCssInlinedLinkTags(
  clientReferenceManifest: ClientReferenceManifest,
  serverCSSManifest: ClientCSSReferenceManifest,
  filePath: string,
  serverCSSForEntries: string[],
  injectedCSS: Set<string>,
  collectNewCSSImports?: boolean
): string[] {
  const layoutOrPageCssModules = serverCSSManifest.cssImports[filePath]

  const filePathWithoutExt = filePath.replace(/\.[^.]+$/, '')
  const cssFilesForEntry = new Set(
    clientReferenceManifest.cssFiles?.[filePathWithoutExt] || []
  )

  if (!layoutOrPageCssModules || !cssFilesForEntry.size) {
    return []
  }
  const chunks = new Set<string>()

  for (const mod of layoutOrPageCssModules) {
    // We only include the CSS if it's a global CSS, or it is used by this
    // entrypoint.
    if (
      serverCSSForEntries.includes(mod) ||
      !/\.module\.(css|sass|scss)$/.test(mod)
    ) {
      // If the CSS is already injected by a parent layer, we don't need
      // to inject it again.
      if (!injectedCSS.has(mod)) {
        const modData =
          clientReferenceManifest.clientModules[
            getClientReferenceModuleKey(mod, '')
          ]
        if (modData) {
          for (const chunk of modData.chunks) {
            // If the current entry in the final tree-shaked bundle has that CSS
            // chunk, it means that it's actually used. We should include it.
            if (cssFilesForEntry.has(chunk)) {
              chunks.add(chunk)
              // This might be a new layout, and to make it more efficient and
              // not introducing another loop, we mutate the set directly.
              if (collectNewCSSImports) {
                injectedCSS.add(mod)
              }
            }
          }
        }
      }
    }
  }

  return [...chunks]
}
