import type * as ServerImpl from './navigation-dynamic-rendering'
// Browser variant of `./navigation-dynamic-rendering`. The dynamic-rendering
// helpers only run on the server; callers use optional calls, so these are
// `undefined` in the browser.
export const getPrerenderFallbackParams:
  | typeof ServerImpl.getPrerenderFallbackParams
  | undefined = undefined
export const trackDynamicRouteParamsAccess:
  | typeof ServerImpl.trackDynamicRouteParamsAccess
  | undefined = undefined
export const trackDynamicSearchParamsAccess:
  | typeof ServerImpl.trackDynamicSearchParamsAccess
  | undefined = undefined
