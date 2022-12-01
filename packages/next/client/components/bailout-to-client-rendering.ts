import { staticGenerationAsyncStorage } from './static-generation-async-storage'

export const BAILOUT_TO_CLIENT_RENDERING_ERROR_CODE =
  'BAILOUT_TO_CLIENT_RENDERING_ERROR_CODE'

export function bailoutToClientRendering(reason: string) {
  const staticGenerationStore =
    staticGenerationAsyncStorage && 'getStore' in staticGenerationAsyncStorage
      ? staticGenerationAsyncStorage?.getStore()
      : staticGenerationAsyncStorage

  if (staticGenerationStore?.isStaticGeneration) {
    const error = new Error(reason)
    ;(error as any).digest = BAILOUT_TO_CLIENT_RENDERING_ERROR_CODE
    throw error
  }
}
