import { DynamicServerError } from './hooks-server-context'
import { staticGenerationAsyncStorage } from './static-generation-async-storage'

class StaticGenBailoutError extends Error {
  code = 'NEXT_STATIC_GEN_BAILOUT'
}

export type StaticGenerationBailout = (
  reason: string,
  opts?: { dynamic?: string; link?: string }
) => boolean | never

export const staticGenerationBailout: StaticGenerationBailout = (
  reason,
  opts
) => {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  if (staticGenerationStore?.forceStatic) {
    return true
  }

  if (staticGenerationStore?.dynamicShouldError) {
    const { dynamic = 'error', link } = opts || {}
    const suffix = link ? ` See more info here: ${link}` : ''
    throw new StaticGenBailoutError(
      `Page with \`dynamic = "${dynamic}"\` couldn't be rendered statically because it used \`${reason}\`.${suffix}`
    )
  }

  if (staticGenerationStore) {
    staticGenerationStore.revalidate = 0
  }

  if (staticGenerationStore?.isStaticGeneration) {
    const err = new DynamicServerError(reason)

    staticGenerationStore.dynamicUsageDescription = reason
    staticGenerationStore.dynamicUsageStack = err.stack

    throw err
  }

  return false
}
