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
  [`fallback-${BUILD_MANIFEST}`]: {
    parts: [`fallback-${BUILD_MANIFEST}`],
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
  manifests?: Partial<PagesManifests>
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

    return async (id: ManifestID, required: boolean) => {
      // We'll try to load the manifest up to 3 times in development mode, but
      // only once in production mode. This is because we assume the files
      // should already be available in production mode (pre-built).
      let attemptsRemaining = process.env.NODE_ENV === 'development' ? 3 : 1
      while (attemptsRemaining > 0) {
        try {
          return require(path.join(prefix, ...registry[id].parts))
        } catch (err) {
          attemptsRemaining--

          // If we're at the last attempt, we failed to load the manifest
          // and this is a required manifest, then throw the error.
          if (attemptsRemaining === 0 && required) {
            throw err
          }

          // Otherwise, we'll try again after a short delay.
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        return undefined
      }
    }
  }

  return (id: ManifestID, required: boolean) => {
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
  private async required<T>(id: ManifestID): Promise<T> {
    return await this.load(id, true)
  }

  /**
   * Loads one of the provided manifests. If none of them can be found, it will
   * throw an error.
   *
   * @param ids the IDs of the manifests to load
   * @returns the manifest
   */
  private async or<T>(...ids: ManifestID[]): Promise<T> {
    for (const id of ids) {
      const manifest = await this.load(id, false)
      if (manifest) return manifest
    }

    throw new Error(
      `Invariant: expected one of the manifests to be defined: ${ids.join(
        ', '
      )}`
    )
  }

  /**
   * Optionally loads the manifest if it exists, otherwise undefined.
   *
   * @param id the ID of the optional manifest to load
   * @returns the manifest (if it exists) or undefined
   */
  private async optional<T>(id: ManifestID): Promise<T | undefined> {
    return await this.load(id, false)
  }

  /**
   * Loads the manifest files or throws an error if it could not load it.
   *
   * @param options the options for loading manifests
   * @returns the loaded manifests
   */
  public static async load({
    distDir,
    manifests = {},
  }: LoadManifestsOptions = {}): Promise<PagesManifests> {
    const loader = new ManifestLoader(distDir)

    // TODO: (wyattjoh) re-introduce this
    // prerender: loader.optional(PRERENDER_MANIFEST),

    const [build, subresourceIntegrity, reactLoadable, font, nextFont] =
      await Promise.all([
        // Use the provided build manifest if it exists, otherwise fallback to
        // loading the manifest.
        manifests.build ??
          loader.or<PagesManifests['build']>(
            BUILD_MANIFEST,
            // In development, we'll use the fallback build manifest. This allows
            // us to load the fallback when the original build manifest is not
            // available.
            `fallback-${BUILD_MANIFEST}`
          ),
        // Use the provided subresourceIntegrity manifest if it exists,
        // otherwise fallback to loading the manifest.
        manifests.subresourceIntegrity ??
          loader.optional<PagesManifests['subresourceIntegrity']>(
            SUBRESOURCE_INTEGRITY_MANIFEST
          ),
        // Use the provided reactLoadable manifest if it exists, otherwise
        // fallback to loading the manifest.
        manifests.reactLoadable ??
          loader.required<PagesManifests['reactLoadable']>(
            REACT_LOADABLE_MANIFEST
          ),
        // Use the provided font manifest if it exists, otherwise fallback to
        // loading the manifest.
        manifests.font ??
          loader.optional<PagesManifests['font']>(FONT_MANIFEST),
        // Use the provided nextFont manifest if it exists, otherwise fallback
        // to loading the manifest.
        manifests.nextFont ??
          loader.optional<PagesManifests['nextFont']>(NEXT_FONT_MANIFEST),
      ])

    return {
      build,
      subresourceIntegrity,
      reactLoadable,
      font,
      nextFont,
    }
  }
}
