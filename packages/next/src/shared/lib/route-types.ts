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

// These exclusions are input guards, not optional brands. The inferred-type
// guard also rejects generic forwarding that could accept an existing brand.
type UnbrandedString = string & {
  readonly __page?: never
  readonly __route?: never
}
type Unbranded<Value> =
  Extract<Value, Page | Route> extends never ? unknown : never

// Opaque key remapping collapses literal keys and loses their readonly modifiers.
// Reject readonly/mixed record shapes instead of exposing a writable branded view.
type MutableRecord<Value> =
  (<Input>() => Input extends Value ? 1 : 2) extends <
    Input,
  >() => Input extends { -readonly [Key in keyof Value]: Value[Key] } ? 1 : 2
    ? unknown
    : never

type BrandedSequence<Value extends readonly string[], Brand> = {
  [Index in keyof Value]: Brand
}

/**
 * Declare a raw module identifier at its discovery/ingestion boundary.
 * This does not validate or normalize text; existing Page/Route values must not
 * be reconstructed. Use a semantic normalizer or an explicit Pages bridge when
 * changing representations.
 */
export function createPage<Value extends string>(
  value: Value & UnbrandedString & Unbranded<Value>
): Page {
  return value as unknown as Page
}

/** Declare a normalized pathname at its boundary, without changing its text. */
export function createRoute<Value extends string>(
  value: Value & UnbrandedString & Unbranded<Value>
): Route {
  return value as unknown as Route
}

/** Brand discovered module identifiers without copying or iterating the input. */
export function createPages<Value extends readonly string[]>(
  value: Value & readonly UnbrandedString[] & Unbranded<Value[number]>
): BrandedSequence<Value, Page> {
  return value as unknown as BrandedSequence<Value, Page>
}

/** Brand normalized pathnames while preserving tuple/readonly shape and identity. */
export function createRoutes<Value extends readonly string[]>(
  value: Value & readonly UnbrandedString[] & Unbranded<Value[number]>
): BrandedSequence<Value, Route> {
  return value as unknown as BrandedSequence<Value, Route>
}

/**
 * Declare an App-paths table: normalized URL keys and raw module-ID sequences.
 * An input's top-level record must be mutable; readonly member sequences retain
 * their shape. Both roles are newly constructed here. No keys or sequence
 * members are inspected, copied, normalized or validated.
 */
export function createAppPaths<Value extends Record<string, readonly string[]>>(
  value: Value & {
    [Key in keyof Value]: readonly UnbrandedString[]
  } & Unbranded<keyof Value> &
    Unbranded<Value[keyof Value][number]> &
    MutableRecord<Value>
): { [Key in keyof Value as Route]: BrandedSequence<Value[Key], Page> } {
  return value as unknown as {
    [Key in keyof Value as Route]: BrandedSequence<Value[Key], Page>
  }
}

/**
 * Identity bridge for a proven Pages-router URL/module-key relationship only.
 * An App URL cannot recover route groups, slots or its /page or /route suffix.
 */
export function pagesRouteToPage(value: Route): Page {
  return value as unknown as Page
}

/** Identity bridge for a proven Pages-router module-key/URL relationship only. */
export function pagesPageToRoute(value: Page): Route {
  return value as unknown as Route
}
