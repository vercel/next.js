import type {
  OpaqueFallbackRouteParamEntries,
  OpaqueFallbackRouteParams,
} from '../../server/request/fallback-params'
import { getDynamicParam } from '../../shared/lib/router/utils/get-dynamic-param'
import type { Params } from '../request/params'
import {
  createPrerenderResumeDataCache,
  createRenderResumeDataCache,
  deflateResumeDataCache,
  stringifyResumeDataCache,
  type PrerenderResumeDataCache,
  type RenderResumeDataCache,
} from '../resume-data-cache/resume-data-cache'

export enum DynamicState {
  /**
   * The dynamic access occurred during the RSC render phase.
   */
  DATA = 1,

  /**
   * The dynamic access occurred during the HTML shell render phase.
   */
  HTML = 2,
}

/**
 * The postponed state for dynamic data.
 */
export type DynamicDataPostponedState = {
  /**
   * The type of dynamic state.
   */
  readonly type: DynamicState.DATA

  /**
   * The immutable resume data cache.
   */
  readonly renderResumeDataCache: RenderResumeDataCache
}

/**
 * The postponed state for dynamic HTML.
 */
export type DynamicHTMLPostponedState = {
  /**
   * The type of dynamic state.
   */
  readonly type: DynamicState.HTML

  /**
   * The postponed data used by React.
   */
  readonly data: [
    preludeState: DynamicHTMLPreludeState,
    postponed: ReactPostponed,
  ]

  /**
   * The immutable resume data cache.
   */
  readonly renderResumeDataCache: RenderResumeDataCache
}

export const enum DynamicHTMLPreludeState {
  Empty = 0,
  Full = 1,
}

type ReactPostponed = NonNullable<
  import('react-dom/static').PrerenderResult['postponed']
>

export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

async function serializePostponedState(
  postponedString: string,
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache,
  isCacheComponentsEnabled: boolean,
  maxPostponedStateSizeBytes: number | undefined,
  disableResumeDataCacheCompression: boolean
): Promise<string> {
  const prefix = `${postponedString.length}:${postponedString}`
  let serializedResumeDataCache = await stringifyResumeDataCache(
    resumeDataCache,
    isCacheComponentsEnabled
  )

  if (!disableResumeDataCacheCompression) {
    if (maxPostponedStateSizeBytes !== undefined) {
      const uncompressedPostponedStateByteLength =
        Buffer.byteLength(prefix) + Buffer.byteLength(serializedResumeDataCache)

      if (uncompressedPostponedStateByteLength > maxPostponedStateSizeBytes) {
        console.warn(
          `The uncompressed postponed state is ${uncompressedPostponedStateByteLength} bytes, which exceeds the configured experimental.maxPostponedStateSize limit of ${maxPostponedStateSizeBytes} bytes. Next.js currently compresses the Resume Data Cache before persisting the postponed state, but this compression will be removed in a future release. Increase experimental.maxPostponedStateSize to ensure this route can still be resumed after that change.`
        )
      }
    }

    serializedResumeDataCache = deflateResumeDataCache(
      serializedResumeDataCache
    )
  }

  return prefix + serializedResumeDataCache
}

export async function getDynamicHTMLPostponedState(
  postponed: ReactPostponed,
  preludeState: DynamicHTMLPreludeState,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache,
  isCacheComponentsEnabled: boolean,
  maxPostponedStateSizeBytes?: number,
  disableResumeDataCacheCompression = false
): Promise<string> {
  const data: DynamicHTMLPostponedState['data'] = [preludeState, postponed]
  const dataString = JSON.stringify(data)

  // If there are no fallback route params, we can just serialize the postponed
  // state as is.
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    // Serialized as `<postponedString.length>:<postponedString><renderResumeDataCache>`
    return serializePostponedState(
      dataString,
      resumeDataCache,
      isCacheComponentsEnabled,
      maxPostponedStateSizeBytes,
      disableResumeDataCacheCompression
    )
  }

  const replacements: OpaqueFallbackRouteParamEntries = Array.from(
    fallbackRouteParams.entries()
  )
  const replacementsString = JSON.stringify(replacements)

  // Serialized as `<replacements.length><replacements><data>`
  const postponedString = `${replacementsString.length}${replacementsString}${dataString}`

  // Serialized as `<postponedString.length>:<postponedString><renderResumeDataCache>`
  return serializePostponedState(
    postponedString,
    resumeDataCache,
    isCacheComponentsEnabled,
    maxPostponedStateSizeBytes,
    disableResumeDataCacheCompression
  )
}

export async function getDynamicDataPostponedState(
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache,
  isCacheComponentsEnabled: boolean,
  maxPostponedStateSizeBytes?: number,
  disableResumeDataCacheCompression = false
): Promise<string> {
  return serializePostponedState(
    'null',
    resumeDataCache,
    isCacheComponentsEnabled,
    maxPostponedStateSizeBytes,
    disableResumeDataCacheCompression
  )
}

function parsePostponedStateParts(
  state: string,
  maxPostponedStateSizeBytes: number | undefined,
  disableResumeDataCacheCompression: boolean
): {
  postponedString: string
  renderResumeDataCache: RenderResumeDataCache
} {
  const postponedStringLengthMatch = state.match(/^([0-9]*):/)?.[1]
  if (!postponedStringLengthMatch) {
    // Do not include the raw state in the message: it can be large and may
    // contain sensitive serialized data.
    throw new Error('Invariant: invalid postponed state: missing length prefix')
  }

  const postponedStringLength = parseInt(postponedStringLengthMatch)
  const tailStart =
    postponedStringLengthMatch.length + postponedStringLength + 1

  return {
    postponedString: state.slice(
      postponedStringLengthMatch.length + 1,
      tailStart
    ),
    renderResumeDataCache: createRenderResumeDataCache(
      state.slice(tailStart),
      maxPostponedStateSizeBytes,
      disableResumeDataCacheCompression
    ),
  }
}

export function parseResumeDataCacheFromPostponedState(
  state: string,
  maxPostponedStateSizeBytes: number | undefined,
  disableResumeDataCacheCompression = false
): RenderResumeDataCache {
  try {
    return parsePostponedStateParts(
      state,
      maxPostponedStateSizeBytes,
      disableResumeDataCacheCompression
    ).renderResumeDataCache
  } catch (err) {
    console.error(
      'Failed to parse postponed state',
      describePostponedStateParseFailure(state, err)
    )
    return createRenderResumeDataCache(createPrerenderResumeDataCache())
  }
}

export function parsePostponedState(
  state: string,
  interpolatedParams: Params,
  maxPostponedStateSizeBytes: number | undefined,
  disableResumeDataCacheCompression = false
): PostponedState {
  try {
    const { postponedString, renderResumeDataCache } = parsePostponedStateParts(
      state,
      maxPostponedStateSizeBytes,
      disableResumeDataCacheCompression
    )

    try {
      if (postponedString === 'null') {
        return { type: DynamicState.DATA, renderResumeDataCache }
      }

      if (/^[0-9]/.test(postponedString)) {
        const match = postponedString.match(/^([0-9]*)/)?.[1]
        if (!match) {
          throw new Error(
            `Invariant: invalid postponed state ${JSON.stringify(postponedString)}`
          )
        }

        // This is the length of the replacements entries.
        const length = parseInt(match)
        const replacements = JSON.parse(
          postponedString.slice(
            match.length,
            // We then go to the end of the string.
            match.length + length
          )
        ) as OpaqueFallbackRouteParamEntries

        let postponed = postponedString.slice(match.length + length)
        for (const [
          segmentKey,
          [searchValue, dynamicParamType],
        ] of replacements) {
          const {
            treeSegment: [
              ,
              // This is the same value that'll be used in the postponed state
              // as it's part of the tree data. That's why we use it as the
              // replacement value.
              value,
            ],
          } = getDynamicParam(
            interpolatedParams,
            segmentKey,
            dynamicParamType,
            null,
            null // staticSiblings not needed for postponed state
          )

          postponed = postponed.replaceAll(searchValue, value)
        }

        return {
          type: DynamicState.HTML,
          data: JSON.parse(postponed),
          renderResumeDataCache,
        }
      }

      return {
        type: DynamicState.HTML,
        data: JSON.parse(postponedString),
        renderResumeDataCache,
      }
    } catch (err) {
      console.error(
        'Failed to parse postponed state',
        describePostponedStateParseFailure(state, err)
      )
      return { type: DynamicState.DATA, renderResumeDataCache }
    }
  } catch (err) {
    console.error(
      'Failed to parse postponed state',
      describePostponedStateParseFailure(state, err)
    )
    return {
      type: DynamicState.DATA,
      renderResumeDataCache: createRenderResumeDataCache(
        createPrerenderResumeDataCache()
      ),
    }
  }
}

/**
 * Derives content-free diagnostics about a postponed state that failed to
 * parse, so the error log is actionable without exposing the (potentially
 * sensitive) serialized contents. Every field is a size, a structural flag, or
 * an error code, never the state bytes themselves.
 *
 * The serialized layout is `<N>:<postponedString><cache>`. The cache is a
 * base64-deflate string by default and raw JSON when RDC compression is
 * disabled, so these fields distinguish the failure shapes:
 * - `postponedStringComplete: false`: the declared length `N` exceeds what
 * actually arrived, i.e. the postponed string itself was truncated.
 * - `errorCode: 'Z_BUF_ERROR'` with an empty or short tail: the
 * resume-data-cache tail was truncated (ran out of input while inflating).
 * - `errorCode: 'Z_DATA_ERROR'`: the tail bytes are corrupt, not merely short.
 * - `hasLengthPrefix: false`: the body had no `<N>:` prefix at all (e.g. empty
 * or otherwise malformed input).
 */
function describePostponedStateParseFailure(
  state: string,
  error: unknown
): Record<string, unknown> {
  const errnoError = error as NodeJS.ErrnoException | undefined
  const diagnostics: Record<string, unknown> = {
    stateLength: state.length,
    errorName: error instanceof Error ? error.name : typeof error,
    errorCode: errnoError?.code,
  }

  const prefixMatch = state.match(/^([0-9]+):/)
  if (!prefixMatch) {
    diagnostics.hasLengthPrefix = false
    return diagnostics
  }

  const declaredPostponedLength = parseInt(prefixMatch[1], 10)
  const tailStart = prefixMatch[0].length + declaredPostponedLength
  const tail = state.slice(tailStart)

  diagnostics.hasLengthPrefix = true
  diagnostics.declaredPostponedLength = declaredPostponedLength
  diagnostics.postponedStringComplete = state.length >= tailStart
  diagnostics.resumeDataCacheTailLength = tail.length
  diagnostics.resumeDataCacheTailIsNull = tail === 'null'

  return diagnostics
}

export function getPostponedFromState(state: DynamicHTMLPostponedState) {
  const [preludeState, postponed] = state.data
  return { preludeState, postponed }
}

/**
 * Cheaply determines whether a serialized postponed state represents an empty
 * HTML prelude — i.e. the static shell rendered no bytes before the first
 * dynamic hole (a blocking dynamic API at the root with no Suspense boundary
 * above it). Returns false for dynamic-data states or unparseable input.
 *
 * Unlike `parsePostponedState`, this does not interpolate fallback route params
 * or build a resume data cache: it only reads the prelude marker, which is
 * independent of param values. The Instant Navigation Testing API uses this to
 * detect the blank-document case in both dev (fresh render) and production
 * (prebuilt shell), where the marker is persisted in the postponed state.
 */
export function isEmptyHTMLPrelude(state: string): boolean {
  try {
    const lengthMatch = state.match(/^([0-9]*):/)?.[1]
    if (!lengthMatch) {
      return false
    }

    const length = parseInt(lengthMatch)
    let postponedString = state.slice(
      lengthMatch.length + 1,
      lengthMatch.length + 1 + length
    )

    // `null` is the dynamic-data case (a full shell was produced).
    if (postponedString === 'null') {
      return false
    }

    // An optional `<n><replacements>` prefix carries fallback route param
    // replacements; skip it to reach the `[preludeState, postponed]` data.
    if (/^[0-9]/.test(postponedString)) {
      const replacementsLengthMatch = postponedString.match(/^([0-9]*)/)?.[1]
      if (!replacementsLengthMatch) {
        return false
      }
      const replacementsLength = parseInt(replacementsLengthMatch)
      postponedString = postponedString.slice(
        replacementsLengthMatch.length + replacementsLength
      )
    }

    const data = JSON.parse(postponedString)
    return Array.isArray(data) && data[0] === DynamicHTMLPreludeState.Empty
  } catch {
    return false
  }
}
