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
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'

/**
 * Carries the variant's identity: `<exportName>@<modulePath>`, with `/` in the
 * module path written as `~` (and a literal `~` doubled) so that the identity
 * is a single flat token.
 *
 * e.g. `theme@variants.ts`, `newNav@src~lib~flags.ts`.
 *
 * The escaping is write-only: nothing reverses it, so the identity is an opaque
 * string to every consumer and is used verbatim in the store, the emit data,
 * and the manifest. That is what avoids needing a mapping table anywhere.
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
 * Asserts that a variant value is a string.
 *
 * Strings are the only requirement: a value is transported percent-encoded in a
 * header and identified by a hash of it, so no character needs excluding. What
 * cannot be allowed is a non-string, which would serialize into a combination
 * that no longer round-trips.
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

  const read = (): Promise<T> => readVariant(key) as Promise<T>

  return Object.defineProperties(read, {
    [VARIANT_KEY]: { value: key },
    [VARIANT_DECIDE]: { value: decide },
  }) as Variant<T>
}

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
 * Normalizes one combination returned from `generateStaticVariants` into the
 * record keyed by variant identity that feeds both the URL encoding and the
 * prerender hash.
 *
 * Validated here, where the author's values enter the framework, so that a bad
 * assignment names the route that declared it rather than failing later in the
 * export pipeline with nothing to point at.
 */
export function normalizeVariantAssignments(
  assignments: unknown,
  route: string
): Record<string, string> {
  if (!Array.isArray(assignments)) {
    throw new Error(
      `\`generateStaticVariants\` for ${route} returned a combination that is not an array. Each combination is a list of \`[variant, value]\` tuples.`
    )
  }

  const values: Record<string, string> = {}

  for (const assignment of assignments) {
    if (!Array.isArray(assignment) || assignment.length !== 2) {
      throw new Error(
        `\`generateStaticVariants\` for ${route} returned a combination containing something that is not a \`[variant, value]\` tuple.`
      )
    }

    const [variantReader, value] = assignment

    if (!isVariant(variantReader)) {
      throw new Error(
        `\`generateStaticVariants\` for ${route} assigned a value to something that is not a variant. Use the value exported from a \`'use variants'\` module, for example \`[theme, 'dark']\`.`
      )
    }

    const key = getVariantKey(variantReader)

    if (key in values) {
      throw new Error(
        `\`generateStaticVariants\` for ${route} assigned the variant \`${key}\` more than once in one combination. A variant can only take one value per combination.`
      )
    }

    values[key] = assertValidVariantValue(key, value, 'assignment')
  }

  return values
}

/**
 * Resolves a variant value at the render stage it belongs to.
 *
 * A variant resolves late enough to stay out of the shells a render can yield,
 * which are shared across a route's params, because a variant can be derived
 * from one. It still reaches the output belonging to its own combination. This
 * is conservative: `decide` receives the request, so any variant might read the
 * URL, and nothing yet tells apart the ones that do not.
 *
 * A render with no staged rendering has no shell to stay out of, so the value
 * resolves immediately.
 */
function resolveInStage(
  workUnitStore: WorkUnitStore,
  stage: AdvanceableRenderStage,
  apiName: string,
  value: string
): Promise<string> {
  const stagedRendering = getStagedRenderingController(workUnitStore)

  if (!stagedRendering) {
    return Promise.resolve(value)
  }

  return stagedRendering.delayUntilStage(stage, apiName, value)
}

function readVariant(key: string): Promise<string> {
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
      const staticValue = workUnitStore.staticVariants?.[key]

      if (staticValue !== undefined) {
        return resolveInStage(
          workUnitStore,
          // A variant can be derived from a param, so it must not land in a
          // shell, which is shared across a route's params. The static stage
          // is past the app shell, so resolving there keeps it out of that one
          // while still baking it into this combination's own output. A
          // session shell is taken after the static stage, though, so when dev
          // needs to recover one the value waits for the runtime stage
          // instead. Static params are delayed by the same rule.
          workUnitStore.needsAppShell
            ? RENDER_STAGES_BY_DATA_KIND.runtimeLinkData
            : RENDER_STAGES_BY_DATA_KIND.staticLinkData,
          apiName,
          staticValue
        )
      }

      const runtimeValue = workUnitStore.runtimeVariants?.[key]

      if (runtimeValue !== undefined) {
        // No combination fixes this one, so nothing cached may contain it, not
        // just the shells: no prerender's key mentions it. The runtime stage is
        // past every one of them, so there is no `needsAppShell` case to
        // distinguish here.
        return resolveInStage(
          workUnitStore,
          RENDER_STAGES_BY_DATA_KIND.runtimeLinkData,
          apiName,
          runtimeValue
        )
      }

      // The proxy resolves variants, so a variant in neither map almost always
      // means this route is not covered by the proxy's matcher.
      throw new Error(
        `Route ${workStore.route} read ${apiName}, but no value was resolved for this request. This usually means the route is not covered by your \`proxy.ts\` matcher.`
      )
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
    // A prerender that was generated for a combination fixing this variant can
    // bake the value in. Otherwise there is no value this output could be
    // correct for, so the variant behaves as a dynamic read: the prerender
    // defers it and the value arrives at request time, which is how a route
    // serves combinations that were never enumerated. Each kind of prerender
    // interrupts differently, matching the other request APIs.
    case 'prerender': {
      const value = workUnitStore.staticVariants?.[key]

      if (value !== undefined) {
        return resolveInStage(
          workUnitStore,
          RENDER_STAGES_BY_DATA_KIND.staticLinkData,
          apiName,
          value
        )
      }

      // Runtime rather than dynamic data: the proxy resolves variants from the
      // request's cookies and headers, so a runtime prefetch can supply one
      // even though a static prerender cannot. Going through the runtime helper
      // also records the access, so the prefetch encoding knows a runtime
      // prefetch yields more than the static response.
      return makeRuntimeHangingPromise(
        workUnitStore.renderSignal,
        workStore.route,
        apiName,
        workUnitStore
      )
    }
    case 'prerender-runtime': {
      const staticValue = workUnitStore.staticVariants?.[key]

      if (staticValue !== undefined) {
        return resolveInStage(
          workUnitStore,
          RENDER_STAGES_BY_DATA_KIND.staticLinkData,
          apiName,
          staticValue
        )
      }

      const runtimeValue = workUnitStore.runtimeVariants?.[key]

      if (runtimeValue !== undefined) {
        return resolveInStage(
          workUnitStore,
          RENDER_STAGES_BY_DATA_KIND.runtimeLinkData,
          apiName,
          runtimeValue
        )
      }

      // This is already the runtime prerender, so a variant still missing here
      // is not something a prefetch can fill in. Only a real request will
      // resolve it.
      return makeDynamicHangingPromise(
        workUnitStore.renderSignal,
        workStore.route,
        apiName
      )
    }
    case 'prerender-legacy': {
      const value = workUnitStore.staticVariants?.[key]

      if (value !== undefined) {
        return Promise.resolve(value)
      }

      return throwToInterruptStaticGeneration(apiName, workStore, workUnitStore)
    }
    default: {
      throw new InvariantError(
        `Unexpected work unit store type while reading ${apiName}.`
      )
    }
  }
}
