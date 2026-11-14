import type { ActionManifest } from '../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../build/webpack/plugins/flight-manifest-plugin'
import { isStaticMetadataRoute } from '../lib/metadata/is-metadata-route'
import {
  CLIENT_REFERENCE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
} from '../shared/lib/constants'
import {
  evalManifestFromRelativePath,
  loadManifestFromRelativePath,
} from './load-manifest.external'

/** Load Node App Router references without registering them or loading other manifests. */
export function loadReferenceManifests({
  page,
  projectDir,
  distDir,
  isDev,
}: {
  page: string
  projectDir: string
  distDir: string
  isDev: boolean
}) {
  const decodedPage = page.replace(/%5F/g, '_')
  const context = !isStaticMetadataRoute(page)
    ? evalManifestFromRelativePath<{
        __RSC_MANIFEST?: Record<string, ClientReferenceManifest>
      }>({
        projectDir,
        distDir,
        manifest: `server/app${decodedPage}_${CLIENT_REFERENCE_MANIFEST}.js`,
        shouldCache: !isDev,
        handleMissing: true,
      })
    : undefined
  const serverActionsManifest = loadManifestFromRelativePath<ActionManifest>({
    projectDir,
    distDir,
    manifest: `server/${SERVER_REFERENCE_MANIFEST}.json`,
    shouldCache: !isDev,
    handleMissing: true,
  })

  return {
    clientReferenceManifest: context?.__RSC_MANIFEST?.[decodedPage],
    serverActionsManifest,
  }
}
