import type { FallbackRouteParams } from '../../client/components/fallback-params'
import type { Params } from '../request/params'

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
}

export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export function getDynamicHTMLPostponedState(
  data: object,
  fallbackRouteParams: FallbackRouteParams | null
): string {
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    return JSON.stringify(data)
  }

  const replacements: Array<[string, string]> = Array.from(fallbackRouteParams)
  const replacementsString = JSON.stringify(replacements)

  // Serialized as `<length><replacements><data>`
  return `${replacementsString.length}${replacementsString}${JSON.stringify(data)}`
}

export function getDynamicDataPostponedState(): string {
  return 'null'
}

export function parsePostponedState(
  state: string,
  params: Params | undefined
): PostponedState {
  try {
    if (state === 'null') {
      return { type: DynamicState.DATA }
    }

    if (/^[0-9]/.test(state)) {
      const match = state.match(/^([0-9]*)/)?.[1]
      if (!match) {
        throw new Error(`Invariant: invalid postponed state ${state}`)
      }

      // This is the length of the replacements entries.
      const length = parseInt(match)
      const replacements = JSON.parse(
        state.slice(
          match.length,
          // We then go to the end of the string.
          match.length + length
        )
      ) as ReadonlyArray<[string, string]>

      let postponed = state.slice(match.length + length)
      for (const [key, searchValue] of replacements) {
        const value = params?.[key] ?? ''
        const replaceValue = Array.isArray(value) ? value.join('/') : value
        postponed = postponed.replaceAll(searchValue, replaceValue)
      }

      return {
        type: DynamicState.HTML,
        data: JSON.parse(postponed),
      }
    }

    return {
      type: DynamicState.HTML,
      data: JSON.parse(state),
    }
  } catch (err) {
    console.error('Failed to parse postponed state', err)
    return { type: DynamicState.DATA }
  }
}

export function getPostponedFromState(state: PostponedState): any {
  if (state.type === DynamicState.DATA) {
    return null
  }

  return state.data
}
