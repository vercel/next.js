export const DYNAMIC_DATA = 1 as const
export const DYNAMIC_HTML = 2 as const

type DynamicDataPostponedState = typeof DYNAMIC_DATA
type DynamicHTMLPostponedState = [typeof DYNAMIC_HTML, object]
export type PostponedState =
  | DynamicDataPostponedState
  | DynamicHTMLPostponedState

export function getDynamicHTMLPostponedState(
  data: object
): DynamicHTMLPostponedState {
  return [DYNAMIC_HTML, data]
}

export function getPostponedFromState(state: PostponedState): any {
  if (state === DYNAMIC_DATA) {
    return null
  }
  return state[1]
}

export function getDynamicDataPostponedState(): DynamicDataPostponedState {
  return DYNAMIC_DATA
}
