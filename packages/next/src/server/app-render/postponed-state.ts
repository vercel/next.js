import type { DynamicRouteParams } from '../../client/components/params'

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
type DynamicDataPostponedState = {
  /**
   * The type of dynamic state.
   */
  readonly t: DynamicState.DATA

  /**
   * The unknown route params.
   */
  readonly u: Readonly<Record<string, string>> | null
}

/**
 * The postponed state for dynamic HTML.
 */
type DynamicHTMLPostponedState = {
  /**
   * The type of dynamic state.
   */
  readonly t: DynamicState.HTML

  /**
   * The postponed data used by React.
   */
  readonly d: object

  /**
   * The unknown route params.
   */
  readonly u: Readonly<Record<string, string>> | null
}

export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export function getDynamicHTMLPostponedState(
  data: object,
  fallbackRouteParams: DynamicRouteParams | null
): DynamicHTMLPostponedState {
  return {
    t: DynamicState.HTML,
    d: data,
    u: fallbackRouteParams ? Object.fromEntries(fallbackRouteParams) : null,
  }
}

export function getDynamicDataPostponedState(
  fallbackRouteParams: DynamicRouteParams | null
): DynamicDataPostponedState {
  return {
    t: DynamicState.DATA,
    u: fallbackRouteParams ? Object.fromEntries(fallbackRouteParams) : null,
  }
}

export function getPostponedFromState(state: PostponedState): any {
  if (state.t === DynamicState.DATA) {
    return null
  }
  return state.d
}
