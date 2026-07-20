export const RSC_HEADER = 'rsc' as const
export const ACTION_HEADER = 'next-action' as const
// TODO: Instead of sending the full router state, we only need to send the
// segment path. Saves bytes. Then we could also use this field for segment
// prefetches, which also need to specify a particular segment.
export const NEXT_ROUTER_STATE_TREE_HEADER = 'next-router-state-tree' as const
export const NEXT_ROUTER_PREFETCH_HEADER = 'next-router-prefetch' as const
// This contains the path to the segment being prefetched.
// TODO: If we change next-router-state-tree to be a segment path, we can use
// that instead. Then next-router-prefetch and next-router-segment-prefetch can
// be merged into a single enum.
export const NEXT_ROUTER_SEGMENT_PREFETCH_HEADER =
  'next-router-segment-prefetch' as const
export const NEXT_HMR_REFRESH_HEADER = 'next-hmr-refresh' as const
export const NEXT_HMR_REFRESH_HASH_COOKIE = '__next_hmr_refresh_hash__' as const
export const NEXT_URL = 'next-url' as const
export const RSC_CONTENT_TYPE_HEADER = 'text/x-component' as const

// Cookie for the Instant Navigation Testing API. Sent automatically with all
// requests while a navigation lock is held; the server uses its presence to
// render only the shell. Not exposed in production builds by default.
export const NEXT_INSTANT_TEST_COOKIE =
  'next-instant-navigation-testing' as const

// Headers set on prefetch requests when Cache Components is enabled. Unlike
// the Next.js-specific headers above, these are standard(-ish) HTTP headers,
// so that infrastructure sitting in front of the application server (e.g. a
// CDN or proxy) can use them to decide how to handle a prefetch request
// without understanding Next.js protocol internals.
//
// `purpose: prefetch` marks the request as a prefetch, as opposed to a normal
// navigation. (Browsers send the same header for speculative loads like
// <link rel="prefetch">.)
//
// The `prefer` header describes what kind of response the client can accept:
//
// - `return=minimal`: a minimal response is sufficient. E.g. if only a
//   partial fallback shell of the page is available, serving it as-is is
//   fine, and should not trigger regeneration of the full page.
// - `return=representation`: the client intends to use the response as a
//   full representation of the page. E.g. if only a partial fallback shell is
//   available, regeneration of the full page may be triggered.
export const PURPOSE_HEADER = 'purpose' as const
export const PURPOSE_PREFETCH = 'prefetch' as const
export const PREFER_HEADER = 'prefer' as const
export const PREFER_RETURN_MINIMAL = 'return=minimal' as const
export const PREFER_RETURN_REPRESENTATION = 'return=representation' as const

export const FLIGHT_HEADERS = [
  RSC_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_HMR_REFRESH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
] as const

export const NEXT_RSC_UNION_QUERY = '_rsc' as const

export const NEXT_ROUTER_STALE_TIME_HEADER = 'x-nextjs-stale-time' as const
export const NEXT_DID_POSTPONE_HEADER = 'x-nextjs-postponed' as const
export const NEXT_REWRITTEN_PATH_HEADER = 'x-nextjs-rewritten-path' as const
export const NEXT_REWRITTEN_QUERY_HEADER = 'x-nextjs-rewritten-query' as const
export const NEXT_IS_PRERENDER_HEADER = 'x-nextjs-prerender' as const
export const NEXT_ACTION_NOT_FOUND_HEADER = 'x-nextjs-action-not-found' as const
export const NEXT_REQUEST_ID_HEADER = 'x-nextjs-request-id' as const
export const NEXT_HTML_REQUEST_ID_HEADER = 'x-nextjs-html-request-id' as const

// TODO: Should this include nextjs in the name, like the others?
export const NEXT_ACTION_REVALIDATED_HEADER = 'x-action-revalidated' as const
