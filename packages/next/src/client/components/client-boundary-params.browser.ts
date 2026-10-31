// Browser variant of `./client-boundary-params`. In the browser the params and
// searchParams are created at render time rather than dynamically tracked.
export { createRenderParamsFromClient as createClientParams } from '../request/params.browser'
export { createRenderSearchParamsFromClient as createClientSearchParams } from '../request/search-params.browser'
