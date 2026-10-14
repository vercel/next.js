/**
 * An unnormalized page identifier. App pages retain internal segments such as
 * route groups, parallel slots, intercepting markers and `/page` or `/route`.
 * This is not a filesystem path or a URL pathname.
 */
export type Page = string & { readonly __page: unique symbol }

/**
 * A normalized URL pathname, possibly containing dynamic route placeholders.
 * App-specific page segments have been removed by the normalization boundary.
 * This internal brand is separate from the public `next` typedRoutes type.
 */
export type Route = string & { readonly __route: unique symbol }
