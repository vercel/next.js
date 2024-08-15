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
  t: DynamicState.DATA

  /**
   * The unknown route params.
   */
  u: ReadonlyArray<string> | null
}

/**
 * The postponed state for dynamic HTML.
 */
type DynamicHTMLPostponedState = {
  /**
   * The type of dynamic state.
   */
  t: DynamicState.HTML

  /**
   * The postponed data used by React.
   */
  d: object

  /**
   * The unknown route params.
   */
  u: ReadonlyArray<string> | null
}

export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export function getDynamicHTMLPostponedState(
  data: object,
  unknownRouteParams: DynamicRouteParams | null
): DynamicHTMLPostponedState {
  return {
    t: DynamicState.HTML,
    d: data,
    u: unknownRouteParams ? Array.from(unknownRouteParams.keys()) : null,
  }
}

export function getDynamicDataPostponedState(
  unknownRouteParams: DynamicRouteParams | null
): DynamicDataPostponedState {
  return {
    t: DynamicState.DATA,
    u: unknownRouteParams ? Array.from(unknownRouteParams.keys()) : null,
  }
}

export function getPostponedFromState(state: PostponedState): any {
  if (state.t === DynamicState.DATA) {
    return null
  }
  return state.d
}
