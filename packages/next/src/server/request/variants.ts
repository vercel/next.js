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
 * Carries the identity of the variant, in the form `<exportName>@<modulePath>`.
 * A `/` in the module path is written as `~`, and a literal `~` is doubled, so
 * that the identity is one flat token.
 *
 * For example: `theme@variants.ts`, `newNav@src~lib~flags.ts`.
 *
 * The escaping is write-only. Nothing reverses it, so the identity is an opaque
 * string to every consumer, and each one uses it unchanged: the store, the emit
 * data, and the manifest. Therefore no mapping table is necessary anywhere.
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
 * Where a variant value came from. A value reaches the framework from the
 * `decide` function of a variant, which the proxy invokes for each request, or
 * from an assignment the author wrote in `generateStaticVariants`. Both are
 * validated in the same way, but each needs different wording, so that an error
 * points at the right code.
 */
type VariantValueOrigin = 'decide' | 'assignment'

/**
 * Asserts that a variant value is a string.
 *
 * A string is the only requirement. A value travels percent-encoded in a
 * header, and a hash of it identifies the combination, so no character has to
 * be excluded. A value that is not a string is the one thing to reject: it
 * would serialize into a combination that does not round-trip.
 *
 * Callers call this where the value enters the framework, and not where it is
 * consumed, so that the error names both the variant and the code that supplied
 * the value.
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
 * Defines a variant. A variant is a value resolved for each request, from
 * cookies, headers, or a flags service, that a route can be prerendered
 * against, in addition to its route params.
 *
 * The framework invokes `decide`, in the proxy. User code never invokes it. The
 * return value is the reader: a call to it during a render gives the value
 * resolved for the current request.
 *
 * @param key The identity of the variant. The variants transform will inject
 * it. It is passed explicitly only until that transform exists.
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
 * Normalizes one combination that `generateStaticVariants` returned into a
 * record keyed by variant identity. The URL encoding and the prerender hash
 * both use that record.
 *
 * This function validates the values where they enter the framework, so that a
 * bad assignment names the route that declared it. Otherwise it would fail
 * later in the export pipeline, with nothing to point at.
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
 * A variant resolves late enough to stay out of the shells a render can
 * produce. Those shells are shared across the params of a route, and a variant
 * can be derived from a param. The value still reaches the output that belongs
 * to its own combination. This rule is conservative: `decide` receives the
 * request, so any variant can read the URL, and nothing yet tells apart the
 * ones that do not.
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
          // A variant can be derived from a param, so it must not appear in a
          // shell, which is shared across the params of a route. The static
          // stage is after the app shell, so a value resolved there stays out
          // of that shell and still reaches the output of this combination. A
          // session shell is taken after the static stage, so when dev needs to
          // recover one, the value waits for the runtime stage instead. The
          // same rule delays static params.
          workUnitStore.needsAppShell
            ? RENDER_STAGES_BY_DATA_KIND.runtimeLinkData
            : RENDER_STAGES_BY_DATA_KIND.staticLinkData,
          apiName,
          staticValue
        )
      }

      const runtimeValue = workUnitStore.runtimeVariants?.[key]

      if (runtimeValue !== undefined) {
        // No combination fixes this variant, so nothing cached may contain it,
        // and not only the shells: the key of no prerender mentions it. The
        // runtime stage is after all of them, so there is no `needsAppShell`
        // case to tell apart here.
        return resolveInStage(
          workUnitStore,
          RENDER_STAGES_BY_DATA_KIND.runtimeLinkData,
          apiName,
          runtimeValue
        )
      }

      // The proxy resolves variants. Therefore a variant in neither map almost
      // always means that the matcher of the proxy does not cover this route.
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
    // A prerender generated for a combination that fixes this variant can
    // contain the value. Otherwise no value would make this output correct, so
    // the variant behaves as a dynamic read: the prerender defers it, and the
    // value arrives at request time. That is how a route serves combinations
    // nobody enumerated. Each kind of prerender interrupts in its own way, as
    // the other request APIs do.
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

      // This is runtime data and not dynamic data. The proxy resolves variants
      // from the cookies and headers of the request, so a runtime prefetch can
      // supply one even though a static prerender cannot. The runtime helper
      // also records the access, so the prefetch encoding knows that a runtime
      // prefetch gives more than the static response gives.
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

      // This is already the runtime prerender. A variant that is still missing
      // here is not one a prefetch can supply. Only a real request resolves it.
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
