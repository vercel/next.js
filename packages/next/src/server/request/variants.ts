import type { NextRequest } from '../web/spec-extension/request'

import { InvariantError } from '../../shared/lib/invariant-error'
import { throwToInterruptStaticGeneration } from '../app-render/dynamic-rendering'
import {
  makeDynamicHangingPromise,
  makeRuntimeHangingPromise,
} from '../dynamic-rendering-utils'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import {
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'

/**
 * Carries the identity of a variant, in the form `<exportName>@<modulePath>`.
 * For example: `theme@variants.ts`, `newNav@src~lib~flags.ts`.
 *
 * The form escapes the module path. It writes a `/` as `~`, and doubles a
 * literal `~`. The identity is therefore one flat token.
 *
 * Nothing reverses the escaping. Every consumer treats the identity as an
 * opaque string and uses it unchanged, so no code needs a mapping table.
 */
const VARIANT_KEY = Symbol.for('next.variant.key')

/**
 * Carries the `decide` function, which only the framework may invoke.
 */
const VARIANT_DECIDE = Symbol.for('next.variant.decide')

/**
 * A variant, as exported from a `'use variants'` module. A call to it reads the
 * value resolved for the current request.
 */
export interface Variant<T extends string = string> {
  (): Promise<T>
  readonly [VARIANT_KEY]: string
  readonly [VARIANT_DECIDE]: (request: NextRequest) => T | Promise<T>
}

/**
 * Defines a variant.
 *
 * A variant is a value that each request resolves, from cookies, headers, or a
 * flags service. A route can be prerendered against a variant, in addition to
 * its route params.
 *
 * The framework invokes `decide`, and user code never invokes it. The return
 * value is the reader. A call to the reader during a render returns the value
 * that the current request resolved.
 *
 * TODO(variants): `decide` receives the request only until it receives the
 * params of the route instead, with cookies and headers reached through their
 * own APIs. Resolution then needs the route match that produces those params.
 *
 * @param key The identity of the variant. TODO(variants): the variants
 * transform will inject this, so it is a parameter only until that transform
 * exists.
 */
export function unstable_variant<T extends string = string>(
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
      '`unstable_variant()` expects a `decide` function as its first argument.'
    )
  }

  if (!key) {
    throw new InvariantError(
      "A variant was defined without an identity. Variants must be declared in a module with the `'use variants'` directive so that the transform can assign one."
    )
  }

  const read = (): Promise<T> => readVariant(key) as Promise<T>

  return Object.defineProperties(read, {
    [VARIANT_KEY]: { value: key },
    [VARIANT_DECIDE]: { value: decide },
  }) as Variant<T>
}

/**
 * Reads the value that the current request resolved for a variant.
 *
 * This function is not `async`, by design. A prerender interrupts a read either
 * by postponing or by throwing. The renderer recognizes both only during the
 * render itself. A promise rejection would arrive later, and would surface as
 * an ordinary error.
 */
function readVariant(key: string): Promise<string> {
  const variantName = `variant \`${key}\``

  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore || !workUnitStore) {
    throwForMissingRequestStore(variantName)
  }

  switch (workUnitStore.type) {
    case 'request': {
      // A request resolves its variants before the render, and the values
      // reach the render through this store. A read finds nothing when the
      // request resolved nothing.
      //
      // The message names no cause, on purpose. Resolution covers every route
      // that reads a variant, so no matcher configuration explains a missing
      // value.
      //
      // TODO(variants): no code puts values on this store yet, so every read
      // reaches this error.
      throw new Error(
        `Route ${workStore.route} read ${variantName}, but no value was resolved for this request.`
      )
    }
    case 'cache':
    case 'unstable-cache':
    case 'private-cache': {
      throw new Error(
        `Route ${workStore.route} read ${variantName} inside a cache scope. This is not supported yet. Read the variant outside the cached function and pass the value in as an argument.`
      )
    }
    case 'generate-static-params': {
      throw new Error(
        `Route ${workStore.route} read ${variantName} inside \`generateStaticParams\`. This is not supported, because \`generateStaticParams\` is where variant values are enumerated.`
      )
    }
    case 'prerender-client':
    case 'validation-client': {
      throw new InvariantError(
        `${variantName} must not be read within a Client Component. Next.js should be preventing variants from being included in Client Components, but did not in this case.`
      )
    }
    // A request resolves a variant, so no prerender holds a value for one. Each
    // read below interrupts the prerender instead, and the value then arrives
    // at request time. Each kind of prerender interrupts in the way that it
    // requires, as the other request APIs do.
    //
    // TODO(variants): a prerender produced for a declared combination holds the
    // values that the combination fixes, and returns one here. The interrupts
    // then cover only the combinations that nothing declared.
    case 'prerender': {
      // A variant is runtime data, and not dynamic data. A request resolves it
      // from cookies and headers, so a runtime prefetch can supply a value
      // where a static prerender cannot. This helper also records the access,
      // which tells the prefetch encoding that a runtime prefetch returns more
      // than the static response.
      return makeRuntimeHangingPromise(
        workUnitStore.renderSignal,
        workStore.route,
        variantName,
        workUnitStore
      )
    }
    case 'prerender-runtime': {
      // A runtime prefetch produces this store. Only a real request resolves a
      // variant, so the read is dynamic here.
      return makeDynamicHangingPromise(
        workUnitStore.renderSignal,
        workStore.route,
        variantName
      )
    }
    case 'prerender-legacy': {
      return throwToInterruptStaticGeneration(
        variantName,
        workStore,
        workUnitStore
      )
    }
    default: {
      throw new InvariantError(
        `Unexpected work unit store type while reading ${variantName}.`
      )
    }
  }
}
