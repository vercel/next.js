import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

export function appendSuffixToClientReferenceManifest(
  manifest: DeepReadonly<ClientReferenceManifest>,
  suffix: string
): ClientReferenceManifest {
  // @ts-expect-error making it mutable
  const updatedManifest: ClientReferenceManifest = {
    ...manifest,
    clientModules: { ...manifest.clientModules },
  }
  for (const key in updatedManifest.clientModules) {
    let val = { ...updatedManifest.clientModules[key] }
    updatedManifest.clientModules[key] = val
    // The format for Webpack is:
    // ['519', 'static/chunks/....js', '1492', 'static/chunks/....js']
    val.chunks = val.chunks.map((c) => {
      return c.endsWith('.js') || c.endsWith('.css') ? c + suffix : c
    })
  }

  return updatedManifest
}
