// Client-safe creation of the params/searchParams passed to client Page and
// Segment components. On the server these produce dynamically-tracked values;
// in the browser bundle this module is aliased to
// `./client-boundary-params.browser` (see
// scripts/generate-browser-variant-aliases.mjs), which produces the render-time
// values. Both variants share the same call signature, so consumers call them
// without branching on `typeof window`.
export { createParamsFromClient as createClientParams } from '../../server/request/params'
export { createSearchParamsFromClient as createClientSearchParams } from '../../server/request/search-params'
