import type { FallbackRouteParams } from '../../server/request/fallback-params'
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
  readonly data: object

  /**
   * The immutable resume data cache.
   */
  readonly renderResumeDataCache: RenderResumeDataCache
}

export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export async function getDynamicHTMLPostponedState(
  data: object,
  fallbackRouteParams: FallbackRouteParams | null,
  prerenderResumeDataCache: PrerenderResumeDataCache
): Promise<string> {
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    const postponedString = JSON.stringify(data)

    // Serialized as `<postponedString.length>:<postponedString><renderResumeDataCache>`
    return `${postponedString.length}:${postponedString}${await stringifyResumeDataCache(
      createRenderResumeDataCache(prerenderResumeDataCache)
    )}`
  }

  const replacements: Array<[string, string]> = Array.from(fallbackRouteParams)
  const replacementsString = JSON.stringify(replacements)
  const dataString = JSON.stringify(data)

  // Serialized as `<replacements.length><replacements><data>`
  const postponedString = `${replacementsString.length}${replacementsString}${dataString}`

  // Serialized as `<postponedString.length>:<postponedString><renderResumeDataCache>`
  return `${postponedString.length}:${postponedString}${await stringifyResumeDataCache(prerenderResumeDataCache)}`
}

export async function getDynamicDataPostponedState(
  prerenderResumeDataCache: PrerenderResumeDataCache
): Promise<string> {
  return `4:null${await stringifyResumeDataCache(createRenderResumeDataCache(prerenderResumeDataCache))}`
}

export function parsePostponedState(
  state: string,
  params: Params | undefined
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
        ) as ReadonlyArray<[string, string]>

        let postponed = postponedString.slice(match.length + length)
        for (const [key, searchValue] of replacements) {
          const value = params?.[key] ?? ''
          const replaceValue = Array.isArray(value) ? value.join('/') : value
          postponed = postponed.replaceAll(searchValue, replaceValue)
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

export function getPostponedFromState(state: PostponedState): any {
  if (state.type === DynamicState.DATA) {
    return null
  }

  return state.data
}
