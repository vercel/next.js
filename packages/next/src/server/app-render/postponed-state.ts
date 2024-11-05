import type { FallbackRouteParams } from '../../server/request/fallback-params'
import type { Params } from '../request/params'
import {
  createMutableResumeDataCache,
  type ImmutableResumeDataCache,
} from '../resume-data-cache/resume-data-cache'
import {
  parseResumeDataCache,
  stringifyResumeDataCache,
} from '../resume-data-cache/serialization'

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
  readonly immutableResumeDataCache: ImmutableResumeDataCache
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
  readonly immutableResumeDataCache: ImmutableResumeDataCache
}

export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export async function getDynamicHTMLPostponedState(
  data: object,
  fallbackRouteParams: FallbackRouteParams | null,
  immutableResumeDataCache: ImmutableResumeDataCache
): Promise<string> {
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    const postponedString = JSON.stringify(data)

    // Serialized as `<postponedString.length>:<postponedString><immutableResumeDataCache>`
    return `${postponedString.length}:${postponedString}${await stringifyResumeDataCache(
      immutableResumeDataCache
    )}`
  }

  const replacements: Array<[string, string]> = Array.from(fallbackRouteParams)
  const replacementsString = JSON.stringify(replacements)
  const dataString = JSON.stringify(data)

  // Serialized as `<replacements.length><replacements><data>`
  const postponedString = `${replacementsString.length}${replacementsString}${dataString}`

  // Serialized as `<postponedString.length>:<postponedString><immutableResumeDataCache>`
  return `${postponedString.length}:${postponedString}${await stringifyResumeDataCache(immutableResumeDataCache)}`
}

export async function getDynamicDataPostponedState(
  immutableResumeDataCache: ImmutableResumeDataCache
): Promise<string> {
  return `4:null${await stringifyResumeDataCache(immutableResumeDataCache)}`
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

    const immutableResumeDataCache = parseResumeDataCache(
      state.slice(postponedStringLengthMatch.length + postponedStringLength + 1)
    )

    try {
      if (postponedString === 'null') {
        return { type: DynamicState.DATA, immutableResumeDataCache }
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
          immutableResumeDataCache,
        }
      }

      return {
        type: DynamicState.HTML,
        data: JSON.parse(postponedString),
        immutableResumeDataCache,
      }
    } catch (err) {
      console.error('Failed to parse postponed state', err)
      return { type: DynamicState.DATA, immutableResumeDataCache }
    }
  } catch (err) {
    console.error('Failed to parse postponed state', err)
    return {
      type: DynamicState.DATA,
      immutableResumeDataCache: createMutableResumeDataCache(),
    }
  }
}

export function getPostponedFromState(state: PostponedState): any {
  if (state.type === DynamicState.DATA) {
    return null
  }

  return state.data
}
