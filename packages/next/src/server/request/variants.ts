import type { NextRequest } from '../web/spec-extension/request'
import type { Params } from './params'

import { InvariantError } from '../../shared/lib/invariant-error'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'

/**
 * Characters a variant identity or value may contain.
 *
 * Excludes `/`, `&`, `=`, and `%` so that values can be packed into a single
 * URL path segment literally, with no percent-encoding. That keeps the packed
 * segment immune to path normalization elsewhere in the stack decoding a `%2F`
 * and splitting it.
 *
 * Also excludes `+` and whitespace, because the packed segment is parsed with
 * `URLSearchParams`, which decodes `+` to a space and would therefore not
 * round-trip a value containing one.
 */
const ALLOWED_CHARS_PATTERN = /^[A-Za-z0-9._~:@!$'()*,;-]*$/

/**
 * Carries the variant's identity: `<exportName>@<modulePath>`, with `/` in the
 * module path written as `~` (and a literal `~` doubled) so that the identity
 * fits in a single URL path segment.
 *
 * e.g. `theme@variants.ts`, `newNav@src~lib~flags.ts`.
 *
 * The escaping is write-only: nothing reverses it, so the identity is an opaque
 * string to every consumer and is used verbatim in the URL, the store, the emit
 * data, and the manifest. That is what avoids needing a mapping table anywhere.
 */
const VARIANT_KEY = Symbol.for('next.variant.key')

/**
 * Carries the `decide` function, which only the framework may invoke.
 */
const VARIANT_DECIDE = Symbol.for('next.variant.decide')

/**
 * A variant, as exported from a `'use variants'` module. Calling it reads the
 * value resolved for the current request.
 */
export interface Variant<T extends string = string> {
  (): Promise<T>
  readonly [VARIANT_KEY]: string
  readonly [VARIANT_DECIDE]: (request: NextRequest) => T | Promise<T>
}

export function getVariantKey(value: Variant<string>): string {
  return value[VARIANT_KEY]
}

export function getVariantDecide(
  value: Variant<string>
): (request: NextRequest) => string | Promise<string> {
  return value[VARIANT_DECIDE]
}

export function isVariant(value: unknown): value is Variant<string> {
  return typeof value === 'function' && VARIANT_KEY in value
}

/**
 * Where a variant value came from. A value reaches the framework either from a
 * variant's `decide` function, which the proxy invokes per request, or from an
 * assignment the author wrote in `generateStaticParams`. Both are validated the
 * same way, but the two need different wording to point at the right code.
 */
type VariantValueOrigin = 'decide' | 'assignment'

/**
 * Asserts that a variant value can be transported in a URL path segment.
 *
 * Called where the value enters the framework rather than where it is consumed,
 * so that the error names both the variant and the code that supplied the
 * value.
 */
export function assertValidVariantValue(
  key: string,
  value: unknown,
  origin: VariantValueOrigin
): string {
  const describe =
    origin === 'decide'
      ? `The variant \`${key}\` resolved to`
      : `The variant \`${key}\` was assigned`

  if (typeof value !== 'string') {
    throw new Error(
      `${describe} a ${typeof value} value. Variant values must be strings.`
    )
  }

  if (!ALLOWED_CHARS_PATTERN.test(value)) {
    throw new Error(
      `${describe} ${JSON.stringify(value)}, which contains characters that cannot be used in a variant value. Variant values may not contain \`/\`, \`&\`, \`=\`, \`%\`, \`+\`, or whitespace.`
    )
  }

  return value
}

/**
 * Defines a variant: a value resolved per request (from cookies, headers, or a
 * flags service) that a route can be prerendered against, in addition to its
 * route params.
 *
 * `decide` is invoked by the framework in the proxy, never by user code. The
 * returned value is the reader: calling it during a render yields the value
 * resolved for the current request.
 *
 * @param key The variant's identity. Injected by the variants transform; passed
 * explicitly only until that transform exists.
 */
export function variant<T extends string = string>(
  decide: (request: NextRequest) => T | Promise<T>,
  key?: string
): Variant<T> {
  if (!process.env.__NEXT_VARIANTS) {
    throw new Error(
      'Variants require the `experimental.variants` option to be enabled in your Next.js config.'
    )
  }

  if (typeof decide !== 'function') {
    throw new Error(
      '`variant()` expects a `decide` function as its first argument.'
    )
  }

  if (!key) {
    throw new InvariantError(
      "A variant was defined without an identity. Variants must be declared in a module with the `'use variants'` directive so that the transform can assign one."
    )
  }

  if (!ALLOWED_CHARS_PATTERN.test(key)) {
    // The identity is derived from the module path and export name, so a module
    // path containing these characters would otherwise corrupt the packed
    // segment rather than fail here.
    throw new InvariantError(
      `The variant identity \`${key}\` contains characters that cannot be used in a variant identity.`
    )
  }

  const read = (): Promise<T> => readVariant(key) as Promise<T>

  return Object.defineProperties(read, {
    [VARIANT_KEY]: { value: key },
    [VARIANT_DECIDE]: { value: decide },
  }) as Variant<T>
}

/**
 * Distinguishes a row produced by `withVariants` from a plain params object, so
 * that `generateStaticParams` can return a mix of both.
 */
const VARIANT_PARAMS_BRAND = Symbol.for('next.variant.params')

/**
 * Assigns one value to one variant. A tuple of the variant itself rather than
 * its name, because an object key would be a local identifier at the call site:
 * under `import { theme as t }` the framework could not map it back to the
 * variant's identity. Tuples are exact and survive renaming.
 */
export type VariantAssignment<T extends string = string> = readonly [
  Variant<T>,
  T,
]

/**
 * A `generateStaticParams` row that carries variant values in addition to
 * params. The values are normalized to a record keyed by variant identity, the
 * single form that feeds both the URL encoding and the prerender hash.
 */
export interface VariantParams {
  readonly [VARIANT_PARAMS_BRAND]: true
  readonly params: Params
  readonly variants: Readonly<Record<string, string>>
}

export function isVariantParams(value: unknown): value is VariantParams {
  return (
    typeof value === 'object' && value !== null && VARIANT_PARAMS_BRAND in value
  )
}

/**
 * Declares that a route should be prerendered for the given params against the
 * given variant values, by returning the result from `generateStaticParams`.
 *
 * Rows returned without it are prerendered once, with no variant values, and
 * every combination that is never enumerated resolves at request time instead.
 *
 * Assignments are validated here rather than later in the export pipeline so
 * that a bad value throws with a stack anchored at the call site that produced
 * it.
 */
export function withVariants(
  params: Params,
  variants: Iterable<VariantAssignment>
): VariantParams {
  if (!process.env.__NEXT_VARIANTS) {
    throw new Error(
      'Variants require the `experimental.variants` option to be enabled in your Next.js config.'
    )
  }

  const values: Record<string, string> = {}

  for (const assignment of variants) {
    if (!Array.isArray(assignment) || assignment.length !== 2) {
      throw new Error(
        '`withVariants()` expects each variant assignment to be a `[variant, value]` tuple.'
      )
    }

    const [variantReader, value] = assignment

    if (!isVariant(variantReader)) {
      throw new Error(
        "`withVariants()` expects each assignment to start with a variant. Pass the value exported from a `'use variants'` module, for example `[theme, 'dark']`."
      )
    }

    const key = getVariantKey(variantReader)

    if (key in values) {
      throw new Error(
        `\`withVariants()\` received the variant \`${key}\` more than once. A variant can only be assigned one value per prerendered combination.`
      )
    }

    values[key] = assertValidVariantValue(key, value, 'assignment')
  }

  return { [VARIANT_PARAMS_BRAND]: true, params, variants: values }
}

async function readVariant(key: string): Promise<string> {
  const apiName = `the variant \`${key}\``

  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError(`Missing workStore while reading ${apiName}.`)
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore) {
    throw new Error(
      `Route ${workStore.route} read ${apiName} outside of a Server Component. This is not allowed.`
    )
  }

  switch (workUnitStore.type) {
    case 'request': {
      const value = workUnitStore.variants[key]
      if (value === undefined) {
        // The proxy resolves variants, so an unresolved variant almost always
        // means this route is not covered by the proxy's matcher.
        throw new Error(
          `Route ${workStore.route} read ${apiName}, but no value was resolved for this request. This usually means the route is not covered by your \`proxy.ts\` matcher.`
        )
      }

      return value
    }
    case 'cache':
    case 'unstable-cache':
    case 'private-cache': {
      throw new Error(
        `Route ${workStore.route} read ${apiName} inside a cache scope. This is not supported yet. Read the variant outside the cached function and pass the value in as an argument.`
      )
    }
    case 'generate-static-params': {
      throw new Error(
        `Route ${workStore.route} read ${apiName} inside \`generateStaticParams\`. This is not supported, because \`generateStaticParams\` is where variant values are enumerated.`
      )
    }
    case 'prerender-client':
    case 'validation-client': {
      throw new InvariantError(
        `${apiName} must not be read within a Client Component. Next.js should be preventing variants from being included in Client Components, but did not in this case.`
      )
    }
    case 'prerender':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'prerender-runtime': {
      // TODO(variants): prerendering reads the value from `PrerenderStore`, and
      // postpones (or defers to the appropriate render stage) when the variant
      // was not enumerated. That arrives with the static-generation work.
      throw new Error(
        `Route ${workStore.route} read ${apiName} while prerendering, which is not supported yet.`
      )
    }
    default: {
      throw new InvariantError(
        `Unexpected work unit store type while reading ${apiName}.`
      )
    }
  }
}
