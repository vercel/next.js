import { StaticGenerationStore } from '../../client/components/static-generation-async-storage'
import {
  PRERENDER_REVALIDATE_HEADER,
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER,
} from '../../lib/constants'
import { headers } from '../../client/components/headers'

/*
 * This function is used to get the revalidate headers from the current request
 */
export function getRevalidateHeaders(
  store: StaticGenerationStore,
  ctx: {
    unstable_onlyGenerated?: boolean
  } = {}
): HeadersInit {
  const previewModeId =
    store.incrementalCache?.prerenderManifest?.preview?.previewModeId ||
    process.env.__NEXT_PREVIEW_MODE_ID

  const reqHeaders: Record<string, undefined | string | string[]> =
    store.incrementalCache?.requestHeaders || Object.fromEntries(headers())

  const revalidateHeaders: typeof reqHeaders = {
    [PRERENDER_REVALIDATE_HEADER]: previewModeId,
    ...(ctx.unstable_onlyGenerated
      ? {
          [PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER]: '1',
        }
      : {}),
  }

  const curAllowedRevalidateHeaderKeys =
    store.incrementalCache?.allowedRevalidateHeaderKeys ||
    process.env.__NEXT_ALLOWED_REVALIDATE_HEADERS

  const allowedRevalidateHeaderKeys = [
    ...(curAllowedRevalidateHeaderKeys || []),
    ...(!store.incrementalCache
      ? ['cookie', 'x-vercel-protection-bypass']
      : []),
  ]

  for (const key of Object.keys(reqHeaders)) {
    if (allowedRevalidateHeaderKeys.includes(key)) {
      revalidateHeaders[key] = reqHeaders[key] as string
    }
  }

  return revalidateHeaders as HeadersInit
}
