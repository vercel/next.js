import type { AppPageModule } from '../route-modules/app-page/module'
import { renderToNodeFlightStream } from './stream-ops'
import { getClientReferenceManifest } from './manifests-singleton'

const filterStackFrame =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .filterStackFrameDEV
    : undefined

/**
 * Encodes dev-validation errors into the RSC Flight bytes the dev overlay
 * revives. Must run in the runtime that produced the errors (the in-process
 * render or the validation worker) so the encode uses the matching
 * client-reference manifest and captures the live `Error` objects with their
 * stacks and digests.
 */
export async function serializeValidationErrorsToFlight(
  componentMod: AppPageModule,
  errors: Error[]
): Promise<Uint8Array[]> {
  const { clientModules } = getClientReferenceManifest()

  const stream = renderToNodeFlightStream(
    componentMod,
    { errors },
    clientModules,
    { filterStackFrame }
  )

  const chunks: Uint8Array[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}
