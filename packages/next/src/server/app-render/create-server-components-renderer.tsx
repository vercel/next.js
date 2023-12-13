import type { RenderOpts } from './types'
import type { AppPageModule } from '../future/route-modules/app-page/module'
import type { createErrorHandler } from './create-error-handler'

export type ServerComponentRendererOptions = {
  ComponentMod: AppPageModule
  inlinedDataTransformStream: TransformStream<Uint8Array, Uint8Array>
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  formState: null | any
  serverComponentsErrorHandler: ReturnType<typeof createErrorHandler>
  nonce?: string
}
