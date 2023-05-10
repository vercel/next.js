import { ClientCSSReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

export function getServerCSSForEntries(
  serverCSSManifest: ClientCSSReferenceManifest,
  entries: string[]
) {
  const css = []
  for (const entry of entries) {
    const entryName = entry.replace(/\.[^.]+$/, '')
    if (
      serverCSSManifest.cssModules &&
      serverCSSManifest.cssModules[entryName]
    ) {
      css.push(...serverCSSManifest.cssModules[entryName])
    }
  }
  return css
}
