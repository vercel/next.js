import type { RouteUrl } from '../../lib/url'

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

// Remap only the parsed pathname role, retaining native field modifiers.
type NativePathname<Value> = {
  [Key in keyof Value]: Key extends 'pathname' ? Route : Value[Key]
}

type BrandedSequence<Value extends readonly string[], Brand> = {
  [Index in keyof Value]: Brand
}
type BrandedKeys<Value extends object, Brand extends string> = {
  [Key in keyof Value as Key extends string ? Brand : Key]: Value[Key]
}
type BrandedEntry<Value extends readonly [string, unknown], Brand> = {
  [Index in keyof Value]: Index extends '0' ? Brand : Value[Index]
}
type BrandedEntries<
  Value extends readonly (readonly [string, unknown])[],
  Brand,
> = {
  [Index in keyof Value]: BrandedEntry<Value[Index], Brand>
}
type SequenceResult<
  Value extends readonly string[] | Promise<readonly string[]>,
  Brand,
> =
  Value extends Promise<infer Sequence extends readonly string[]>
    ? Promise<BrandedSequence<Sequence, Brand>>
    : Value extends readonly string[]
      ? BrandedSequence<Value, Brand>
      : never

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

/** Declare an interpolated pathname, retaining the existing empty failure sentinel. */
export function createRouteOrEmpty<Value extends string>(
  value: Value & UnbrandedString & Unbranded<Value>
): Route | '' {
  return value as unknown as Route | ''
}

/** Declare a raw pathname result without changing its existing null sentinel. */
export function createRouteOrNull<Value extends string | null>(
  value: Value & (UnbrandedString | null) & Unbranded<Value>
): Route | null {
  return value as unknown as Route | null
}

/**
 * Ingest an actual browser Location, retaining its nullable SSR alternative.
 * The browser already parsed its pathname; do not read accessors or brand an
 * unparsed setter input. Native fields and additional payloads remain unchanged.
 */
export function ingestBrowserLocation<Value extends Location | null>(
  value: Value &
    NoInfer<
      ((Location & { pathname: UnbrandedString }) | null) &
        Unbranded<NonNullable<Value>['pathname']>
    >
): Value extends Location ? NativePathname<Value> : null {
  return value as unknown as Value extends Location
    ? NativePathname<Value>
    : null
}

/**
 * Ingest an actual native URL parser result. Its pathname has already undergone
 * native parsing; the original object, accessors and extra fields are retained.
 * This is not validation and must not be used to brand an unparsed setter input.
 */
export function ingestNativeUrl<Value extends URL>(
  value: Value & { pathname: UnbrandedString } & Unbranded<Value['pathname']>
): NativePathname<Value> {
  return value as unknown as NativePathname<Value>
}

/**
 * Expose the same native URL's writable view before its setter parses raw text.
 * This does not reinterpret an unparsed string as a normalized pathname.
 */
export function nativeUrlForWrite(value: RouteUrl): URL {
  return value
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

/** Brand mutable record string keys; non-key values are unchanged. */
export function createPageKeys<Value extends object>(
  value: Value & Unbranded<keyof Value> & MutableRecord<Value>
): BrandedKeys<Value, Page> {
  return value as unknown as BrandedKeys<Value, Page>
}

/** Brand only record keys; this does not construct or reinterpret their values. */
export function createRouteKeys<Value extends object>(
  value: Value & Unbranded<keyof Value> & MutableRecord<Value>
): BrandedKeys<Value, Route> {
  return value as unknown as BrandedKeys<Value, Route>
}

/** Brand native/discovered entry keys without copying entries or changing values. */
export function createPageEntries<
  Value extends readonly (readonly [string, unknown])[],
>(
  value: Value &
    readonly (readonly [UnbrandedString, unknown])[] &
    Unbranded<Value[number][0]>
): BrandedEntries<Value, Page> {
  return value as unknown as BrandedEntries<Value, Page>
}

/** Brand native/discovered entry keys without copying entries or changing values. */
export function createRouteEntries<
  Value extends readonly (readonly [string, unknown])[],
>(
  value: Value &
    readonly (readonly [UnbrandedString, unknown])[] &
    Unbranded<Value[number][0]>
): BrandedEntries<Value, Route> {
  return value as unknown as BrandedEntries<Value, Route>
}

/** Brand a native pathname set without iterating or changing its mutability. */
export function createRouteSet<Value extends ReadonlySet<string>>(
  value: Value &
    ReadonlySet<UnbrandedString> &
    Unbranded<Value extends ReadonlySet<infer Member> ? Member : never>
): Value extends Set<string> ? Set<Route> : ReadonlySet<Route> {
  return value as unknown as Value extends Set<string>
    ? Set<Route>
    : ReadonlySet<Route>
}

/**
 * Ingest a page-loader sequence/result without wrapping its Promise. The loader's
 * public contract remains string-based; this only declares the internal role.
 */
export function createRoutesResult<
  Value extends readonly string[] | Promise<readonly string[]>,
>(
  value: Value &
    (readonly UnbrandedString[] | Promise<readonly UnbrandedString[]>) &
    Unbranded<Awaited<Value>[number]>
): SequenceResult<Value, Route> {
  return value as unknown as SequenceResult<Value, Route>
}

/**
 * Declare an App-paths table: normalized URL keys and raw module-ID sequences.
 * An input's top-level record must be mutable; readonly member sequences retain
 * their shape. Unlike the key-only helpers, both roles are newly constructed here. No keys or
 * sequence members are inspected, copied, normalized or validated.
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
