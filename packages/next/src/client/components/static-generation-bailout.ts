import type { AppConfigDynamic } from '../../build/utils'

import { DynamicServerError } from './hooks-server-context'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'

class StaticGenBailoutError extends Error {
  code = 'NEXT_STATIC_GEN_BAILOUT'
}

type BailoutOpts = { dynamic?: AppConfigDynamic; link?: string }

export type StaticGenerationBailout = (
  reason: string,
  opts?: BailoutOpts
) => boolean | never

function formatErrorMessage(reason: string, opts?: BailoutOpts) {
  const { dynamic, link } = opts || {}
  const suffix = link ? ` See more info here: ${link}` : ''
  return `Page${
    dynamic ? ` with \`dynamic = "${dynamic}"\`` : ''
  } couldn't be rendered statically because it used \`${reason}\`.${suffix}`
}

export const staticGenerationBailout: StaticGenerationBailout = (
  reason,
  { dynamic, link } = {}
) => {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()
  if (!staticGenerationStore) return false

  if (staticGenerationStore.forceStatic) {
    return true
  }

  if (staticGenerationStore.dynamicShouldError) {
    throw new StaticGenBailoutError(
      formatErrorMessage(reason, { link, dynamic: dynamic ?? 'error' })
    )
  }

  const message = formatErrorMessage(reason, {
    dynamic,
    // this error should be caught by Next to bail out of static generation
    // in case it's uncaught, this link provides some additional context as to why
    link: 'https://nextjs.org/docs/messages/dynamic-server-error',
  })

  // If postpone is available, we should postpone the render.
  staticGenerationStore.postpone?.(reason)

  // As this is a bailout, we don't want to revalidate, so set the revalidate
  // to 0.
  staticGenerationStore.revalidate = 0

  if (staticGenerationStore.isStaticGeneration) {
    const err = new DynamicServerError(message)
    staticGenerationStore.dynamicUsageDescription = reason
    staticGenerationStore.dynamicUsageStack = err.stack

    throw err
  }

  return false
}
