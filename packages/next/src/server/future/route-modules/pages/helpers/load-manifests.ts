import type { PagesManifests } from '../module'

import path from '../../../../../shared/lib/isomorphic/path'
import {
  BUILD_MANIFEST,
  FONT_MANIFEST,
  NEXT_FONT_MANIFEST,
  PRERENDER_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  SERVER_DIRECTORY,
  SUBRESOURCE_INTEGRITY_MANIFEST,
} from '../../../../../shared/lib/constants'

/**
 * The registry of the available manifests and their associated global variable
 * names.
 */
const registry = {
  [BUILD_MANIFEST]: {
    variable: '__BUILD_MANIFEST',
    parts: [BUILD_MANIFEST],
  },
  [SUBRESOURCE_INTEGRITY_MANIFEST]: {
    variable: '__SUBRESOURCE_INTEGRITY_MANIFEST',
    parts: [SERVER_DIRECTORY, `${SUBRESOURCE_INTEGRITY_MANIFEST}.json`],
  },
  [REACT_LOADABLE_MANIFEST]: {
    variable: '__REACT_LOADABLE_MANIFEST',
    parts: [REACT_LOADABLE_MANIFEST],
  },
  [PRERENDER_MANIFEST]: {
    // Not available in Edge.
    parts: [PRERENDER_MANIFEST],
  },
  [FONT_MANIFEST]: {
    // Not available in Edge.
    parts: [SERVER_DIRECTORY, FONT_MANIFEST],
  },
  [NEXT_FONT_MANIFEST]: {
    variable: '__NEXT_FONT_MANIFEST',
    parts: [SERVER_DIRECTORY, `${NEXT_FONT_MANIFEST}.json`],
  },
}

type ManifestID = keyof typeof registry
type ManifestLoaderFn = (id: ManifestID, required: boolean) => any

type LoadManifestsOptions = {
  distDir?: string
}

/**
 * Creates a loader which works in either the node or edge runtimes.
 *
 * @param prefix the prefix to use with the non-edge loader
 * @returns the manifest or undefined depending on the `required` flag
 */
function createLoader(prefix?: string): ManifestLoaderFn {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    if (!prefix)
      throw new Error(
        "Invariant: expected 'prefix' to be defined when not in edge"
      )

    return (id, required) => {
      try {
        return require(path.join(prefix, ...registry[id].parts))
      } catch (err) {
        if (required) throw err

        return undefined
      }
    }
  }

  return (id, required) => {
    const entry = registry[id]
    if (!('variable' in entry)) {
      if (required) {
        throw new Error(
          `Invariant: expected required manifest did not have an Edge variable: ${id}`
        )
      }

      return
    }

    const manifest = self[entry.variable as keyof typeof self]
    if (!manifest && required) {
      throw new Error(
        `Invariant: expected required manifest to exist with Edge variable: self.${entry.variable}`
      )
    }

    return manifest
  }
}

export class ManifestLoader {
  private readonly load: ManifestLoaderFn

  private constructor(prefix?: string) {
    this.load = createLoader(prefix)
  }

  /**
   * Loads the manifest. If it can't be found, it will throw an error.
   *
   * @param id the ID of the required manifest to load
   * @returns the manifest
   */
  private required<T>(id: ManifestID): T {
    return this.load(id, true)
  }

  /**
   * Optionally loads the manifest if it exists, otherwise undefined.
   *
   * @param id the ID of the optional manifest to load
   * @returns the manifest (if it exists) or undefined
   */
  private optional<T>(id: ManifestID): T | undefined {
    return this.load(id, false)
  }

  /**
   * Loads the manifest files or throws an error if it could not load it.
   *
   * @param options the options for loading manifests
   * @returns the loaded manifests
   */
  public static load({ distDir }: LoadManifestsOptions = {}): PagesManifests {
    const loader = new ManifestLoader(distDir)

    return {
      build: loader.required(BUILD_MANIFEST),
      subresourceIntegrity: loader.optional(SUBRESOURCE_INTEGRITY_MANIFEST),
      reactLoadable: loader.required(REACT_LOADABLE_MANIFEST),
      prerender: loader.optional(PRERENDER_MANIFEST),
      font: loader.optional(FONT_MANIFEST),
      nextFont: loader.optional(NEXT_FONT_MANIFEST),
    }
  }
}
