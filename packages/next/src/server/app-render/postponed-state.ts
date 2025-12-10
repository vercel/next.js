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
  interpolatedParams: Params
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
      state.slice(postponedStringLengthMatch.length + postponedStringLength + 1)
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
            null
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
      renderResumeDataCache: createPrerenderResumeDataCache(),
    }
  }
}

export function getPostponedFromState(state: DynamicHTMLPostponedState) {
  const [preludeState, postponed] = state.data
  return { preludeState, postponed }
}
