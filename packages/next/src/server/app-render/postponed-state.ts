import type {
  OpaqueFallbackRouteParamEntries,
  OpaqueFallbackRouteParams,
} from '../../server/request/fallback-params'
import { getDynamicParam } from '../../shared/lib/router/utils/get-dynamic-param'
import type { Params } from '../request/params'
import {
  createPrerenderResumeDataCache,
  createRenderResumeDataCache,
  type PrerenderResumeDataCache,
  type RenderResumeDataCache,
} from '../resume-data-cache/resume-data-cache'
import { stringifyResumeDataCache } from '../resume-data-cache/resume-data-cache'

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

export async function getDynamicHTMLPostponedState(
  postponed: ReactPostponed,
  preludeState: DynamicHTMLPreludeState,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache,
  isCacheComponentsEnabled: boolean
): Promise<string> {
  const data: DynamicHTMLPostponedState['data'] = [preludeState, postponed]
  const dataString = JSON.stringify(data)

  // If there are no fallback route params, we can just serialize the postponed
  // state as is.
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    // Serialized as `<postponedString.length>:<postponedString><renderResumeDataCache>`
    return `${dataString.length}:${dataString}${await stringifyResumeDataCache(
      createRenderResumeDataCache(resumeDataCache),
      isCacheComponentsEnabled
    )}`
  }

  const replacements: OpaqueFallbackRouteParamEntries = Array.from(
    fallbackRouteParams.entries()
  )
  const replacementsString = JSON.stringify(replacements)

  // Serialized as `<replacements.length><replacements><data>`
  const postponedString = `${replacementsString.length}${replacementsString}${dataString}`

  // Serialized as `<postponedString.length>:<postponedString><renderResumeDataCache>`
  return `${postponedString.length}:${postponedString}${await stringifyResumeDataCache(resumeDataCache, isCacheComponentsEnabled)}`
}

export async function getDynamicDataPostponedState(
  resumeDataCache: PrerenderResumeDataCache | RenderResumeDataCache,
  isCacheComponentsEnabled: boolean
): Promise<string> {
  return `4:null${await stringifyResumeDataCache(createRenderResumeDataCache(resumeDataCache), isCacheComponentsEnabled)}`
}

export function parsePostponedState(
  state: string,
  interpolatedParams: Params,
  maxPostponedStateSizeBytes: number | undefined
): PostponedState {
  try {
    const postponedStringLengthMatch = state.match(/^([0-9]*):/)?.[1]
    if (!postponedStringLengthMatch) {
      throw new Error(`Invariant: invalid postponed state ${state}`)
    }

    const postponedStringLength = parseInt(postponedStringLengthMatch)

    // We add a `:` to the end of the length as the first character of the
    // postponed string is the length of the replacement entries.
    const postponedString = state.slice(
      postponedStringLengthMatch.length + 1,
      postponedStringLengthMatch.length + postponedStringLength + 1
    )

    const renderResumeDataCache = createRenderResumeDataCache(
      state.slice(
        postponedStringLengthMatch.length + postponedStringLength + 1
      ),
      maxPostponedStateSizeBytes
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
      console.error('Failed to parse postponed state', err)
      return { type: DynamicState.DATA, renderResumeDataCache }
    }
  } catch (err) {
    console.error('Failed to parse postponed state', err)
    return {
      type: DynamicState.DATA,
      renderResumeDataCache: createRenderResumeDataCache(
        createPrerenderResumeDataCache()
      ),
    }
  }
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
