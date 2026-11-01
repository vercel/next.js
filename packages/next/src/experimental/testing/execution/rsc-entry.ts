import { readFile } from 'node:fs/promises'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'
import {
  evalManifest,
  loadManifest,
} from '../../../server/load-manifest.external'
import type { CompiledRscTestArtifact } from '../contracts'
import type { RscTestingBindings } from '../rsc'
import { validateCompiledTestRoute } from '../rsc/route'

export type CompiledRscEntry = {
  ComponentMod: typeof import('../../../server/app-render/entry-base')
  ConsumerMod: typeof import('../rsc/consumer')
  rscTesting?: typeof import('../rsc')
  testRunner: Pick<typeof import('../runner'), 'getActiveAttempt'>
  createRouteEntrypoint?: typeof import('../../../build/templates/app-test').createRouteEntrypoint
  initializeRuntime(): void
  setManifestsSingleton: typeof import('../../../server/app-render/manifests-singleton').setManifestsSingleton
}
type ArtifactPath = (root: string, file: string) => string

/** Validate actual immutable route facts before any emitted application evaluation. */
export async function validateRscEntryArtifact(
  artifact: CompiledRscTestArtifact,
  artifactPath: ArtifactPath
): Promise<void> {
  if (artifact.profile.route !== undefined) {
    validateCompiledTestRoute(artifact.route, artifact.profile)
    if (!artifact.files.includes(artifact.route!.metadataPath))
      throw new Error('Missing immutable RSC route sidecar')
    const nativeRoute = JSON.parse(
      await readFile(
        artifactPath(artifact.rootDir, artifact.route!.metadataPath),
        'utf8'
      )
    )
    const { metadataPath: _, ...routeFacts } = artifact.route!
    if (JSON.stringify(nativeRoute) !== JSON.stringify(routeFacts))
      throw new Error('RSC route sidecar and artifact facts differ')
  } else if (artifact.route)
    throw new Error(
      'Route-less RSC artifact contains unexpected route metadata'
    )
  for (const file of [
    artifact.manifests.clientReference,
    artifact.manifests.serverActions,
  ]) {
    if (!artifact.files.includes(file))
      throw new Error(
        'Artifact closure is missing a required entry or manifest'
      )
    artifactPath(artifact.rootDir, file)
  }
}

/** One actual AppPage runtime owns the graph; each call binds a separate file lease. */
export function prepareCompiledRscEntry(
  rscEntry: CompiledRscEntry,
  artifact: CompiledRscTestArtifact,
  artifactPath: ArtifactPath,
  cacheRealm?: RscTestingBindings['cacheRealm']
) {
  // Only RSC artifacts initialize React/Flight loaders, manifests and fetch.
  // Node entries contain neither these exports nor placeholder manifests.
  if (typeof rscEntry.initializeRuntime !== 'function') {
    throw new Error('Compiled RSC test entry is missing runtime initialization')
  }
  rscEntry.initializeRuntime()
  const manifest = evalManifest<{
    __RSC_MANIFEST: Record<string, ClientReferenceManifest>
  }>(artifactPath(artifact.rootDir, artifact.manifests.clientReference))
    .__RSC_MANIFEST[artifact.manifestPage]
  if (!manifest) {
    throw new Error(
      `Missing client reference manifest for ${artifact.manifestPage}`
    )
  }
  rscEntry.setManifestsSingleton({
    page: artifact.route?.page ?? artifact.manifestPage,
    clientReferenceManifest: manifest,
    serverActionsManifest: loadManifest<ActionManifest>(
      artifactPath(artifact.rootDir, artifact.manifests.serverActions)
    ),
  })
  rscEntry.ComponentMod.patchFetch()
  let routeEntrypoint:
    | NonNullable<RscTestingBindings['routeRendering']>['ComponentMod']
    | undefined
  return (cacheScope: RscTestingBindings['cacheScope']) => {
    if (!rscEntry.rscTesting) return undefined
    const optionalManifestPath = (manifestPath: string | undefined) => {
      if (manifestPath === undefined) return undefined
      if (!artifact.files.includes(manifestPath)) {
        throw new Error('Artifact closure is missing a declared cache manifest')
      }
      return artifactPath(artifact.rootDir, manifestPath)
    }
    return rscEntry.rscTesting.initializeRscTesting({
      ComponentMod: rscEntry.ComponentMod,
      ConsumerMod: rscEntry.ConsumerMod,
      clientReferenceManifest: manifest,
      requestContext: artifact.requestContext,
      profile: artifact.profile,
      manifestPage: artifact.manifestPage,
      route: artifact.route,
      getActiveAttempt: rscEntry.testRunner.getActiveAttempt,
      cacheScope,
      cacheRealm,
      previewPropsPath: optionalManifestPath(artifact.manifests.previewProps),
      prerenderManifestPath: optionalManifestPath(artifact.manifests.prerender),
      ...(artifact.route && artifact.requestContext?.routeRenderOpts
        ? {
            routeRendering: {
              ComponentMod: (() => {
                if (typeof rscEntry.createRouteEntrypoint !== 'function') {
                  throw new Error(
                    'Full route rendering requires the emitted AppPage entrypoint.'
                  )
                }
                return (routeEntrypoint ??= rscEntry.createRouteEntrypoint(
                  artifact.route.page,
                  artifact.route.pathname
                ))
              })(),
              buildManifest: loadManifest<
                NonNullable<
                  RscTestingBindings['routeRendering']
                >['buildManifest']
              >(optionalManifestPath(artifact.manifests.routeBuild)!),
              nextFontManifest: loadManifest<
                NonNullable<
                  NonNullable<
                    RscTestingBindings['routeRendering']
                  >['nextFontManifest']
                >
              >(optionalManifestPath(artifact.manifests.routeFont)!),
              reactLoadableManifest: loadManifest<
                NonNullable<
                  RscTestingBindings['routeRendering']
                >['reactLoadableManifest']
              >(optionalManifestPath(artifact.manifests.routeLoadable)!),
            },
          }
        : {}),
    })
  }
}
