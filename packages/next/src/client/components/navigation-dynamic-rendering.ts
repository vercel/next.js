// Client-safe access to the server-only dynamic-rendering helpers used by
// the navigation hooks. On the server these re-export the real
// implementations; in the browser bundle this module is aliased to
// `./navigation-dynamic-rendering.browser` (see
// scripts/generate-browser-variant-aliases.mjs), which exports `undefined` so
// the server module is not bundled into the client. Callers use optional
// calls (`trackDynamicRouteParamsAccess?.(...)`), so the browser stub is a
// no-op.
export {
  getPrerenderFallbackParams,
  trackDynamicRouteParamsAccess,
  trackDynamicSearchParamsAccess,
} from '../../server/app-render/dynamic-rendering'
