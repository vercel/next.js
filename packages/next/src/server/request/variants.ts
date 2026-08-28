import type { NextRequest } from '../web/spec-extension/request'

import { InvariantError } from '../../shared/lib/invariant-error'
import { throwToInterruptStaticGeneration } from '../app-render/dynamic-rendering'
import {
  makeDynamicHangingPromise,
  makeRuntimeHangingPromise,
  RENDER_STAGES_BY_DATA_KIND,
} from '../dynamic-rendering-utils'
import type { AdvanceableRenderStage } from '../app-render/staged-rendering'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import {
  getStagedRenderingController,
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
 * Where a variant value came from. A `decide` function returns one, and a
 * combination assigns one. Each origin gets its own wording, so that an error
 * names the code that supplied the value.
 */
type VariantValueOrigin = 'decide' | 'assignment'

/**
 * Asserts that a variant value is a string, and returns it.
 *
 * Any string is allowed, whatever characters it holds, because the transport
 * encodes it. A value that is not a string is the one thing to reject: it would
 * serialize into something that does not round-trip.
 */
export function assertValidVariantValue(
  key: string,
  value: unknown,
  origin: VariantValueOrigin
): string {
  if (typeof value !== 'string') {
    // Each origin has its own literal message. A computed prefix would give the
    // two of them one error code, and neither wording would appear in the
    // source.
    if (origin === 'decide') {
      throw new Error(
        `The variant \`${key}\` resolved to a ${typeof value} value. Variant values must be strings.`
      )
    }

    throw new Error(
      `The variant \`${key}\` was assigned a ${typeof value} value. Variant values must be strings.`
    )
  }

  return value
}

/**
 * Defines a variant.
 *
 * A variant is a value that each request resolves, from cookies, headers, or a
 * flags service. A route can be prerendered against a variant, in addition to
 * its route params.
 *
 * The framework invokes `decide`. User code calls the return value instead,
 * which is the reader. A call to the reader during a render returns the value
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
 * Assigns one value to one variant.
 *
 * The tuple holds the variant itself, and not its name. An object key would be
 * a local identifier at the call site: under `import { theme as t }` the
 * framework could not map it back to the identity of the variant. A tuple is
 * exact, and a rename does not change it.
 */
export type VariantAssignment<T extends string = string> = readonly [
  Variant<T>,
  T,
]

/**
 * Resolves a variant value at the render stage that the value belongs to.
 *
 * A variant value must not appear in anything a render caches. No cache key
 * names a variant, so no shell and no prerender may hold one. The runtime stage
 * comes after all of them, so a value delayed to that stage stays out.
 *
 * A render without staged rendering produces no shell, so the value resolves at
 * once.
 */
function resolveInStage(
  workUnitStore: WorkUnitStore,
  stage: AdvanceableRenderStage,
  variantName: string,
  value: string
): Promise<string> {
  const stagedRendering = getStagedRenderingController(workUnitStore)

  if (!stagedRendering) {
    return Promise.resolve(value)
  }

  return stagedRendering.delayUntilStage(stage, variantName, value)
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
      const value = workUnitStore.variants?.[key]

      if (value !== undefined) {
        // TODO(variants): a value that a combination declared belongs to an
        // earlier stage, because the prerender of that combination can hold it.
        // Only a value that no combination declared waits for the runtime
        // stage.
        return resolveInStage(
          workUnitStore,
          RENDER_STAGES_BY_DATA_KIND.runtimeLinkData,
          variantName,
          value
        )
      }

      // A request resolves its variants before the render, and the values reach
      // the render through this store. A read finds nothing when the request
      // resolved nothing.
      //
      // The message names no cause, on purpose. Resolution covers every route
      // that reads a variant, so no matcher configuration explains a missing
      // value.
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
