import { RenderingMode } from '../rendering-mode'
import type { PrerenderManifestRoute } from '..'

export interface PartialPrerenderConfig {
  /**
   * When true, signals that the route completed its build-time prerender
   * without detecting any dynamic components.
   */
  staticHint?: boolean
}

export function getPartialPrerenderConfig(
  renderingMode: RenderingMode | undefined,
  compute: PrerenderManifestRoute['compute']
): PartialPrerenderConfig | undefined {
  if (renderingMode !== RenderingMode.PARTIALLY_STATIC) {
    return undefined
  }

  // The outer config is a capability marker for PPR-aware consumers. Leave
  // the hint unset when the build did not classify the route.
  return compute === undefined ? {} : { staticHint: compute === 'static' }
}
