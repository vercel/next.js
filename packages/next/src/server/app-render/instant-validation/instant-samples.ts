import type { InstantSample } from '../../../build/segment-config/app/app-segment-config'
import type { ReadonlyRequestCookies } from '../../web/spec-extension/adapters/request-cookies'
import type { ReadonlyHeaders } from '../../web/spec-extension/adapters/headers'
import type { DraftModeProvider } from '../../async-storage/draft-mode-provider'
import type { Params } from '../../request/params'

import { RequestCookies } from '../../web/spec-extension/cookies'
import { RequestCookiesAdapter } from '../../web/spec-extension/adapters/request-cookies'
import { HeadersAdapter } from '../../web/spec-extension/adapters/headers'
import type { SearchParams } from '../../request/search-params'
import { getSegmentParam } from '../../../shared/lib/router/utils/get-segment-param'
import { parseRelativeUrl } from '../../../shared/lib/router/utils/parse-relative-url'
import { InvariantError } from '../../../shared/lib/invariant-error'
import { InstantValidationError } from './instant-validation-error'
import { workUnitAsyncStorage } from '../work-unit-async-storage.external'
import { wellKnownProperties } from '../../../shared/lib/utils/reflect-utils'
import type { WorkStore } from '../work-async-storage.external'

export type InstantValidationSampleTracking = {
  // TODO(instant-validation-build): track which samples config we used and attribute errors
  missingSampleErrors: InstantValidationError[]
}

export function createValidationSampleTracking(): InstantValidationSampleTracking {
  return {
    missingSampleErrors: [],
  }
}

function getExpectedSampleTracking(): InstantValidationSampleTracking {
  let validationSampleTracking: InstantValidationSampleTracking | null = null
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'request':
      case 'validation-client':
        // TODO(instant-validation-build): do we need any special handling for caches?
        validationSampleTracking =
          workUnitStore.validationSampleTracking ?? null
        break
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
      case 'prerender-legacy':
      case 'prerender-ppr':
      case 'prerender-client':
      case 'prerender':
      case 'prerender-runtime':
        break
      default:
        workUnitStore satisfies never
    }
  }
  if (!validationSampleTracking) {
    throw new InvariantError(
      'Expected to have a workUnitStore that provides validationSampleTracking'
    )
  }
  return validationSampleTracking
}

export function trackMissingSampleError(error: InstantValidationError): void {
  const validationSampleTracking = getExpectedSampleTracking()
  validationSampleTracking.missingSampleErrors.push(error)
}

export function trackMissingSampleErrorAndThrow(
  error: InstantValidationError
): never {
  // TODO(instant-validation-build): this should abort the render
  trackMissingSampleError(error)
  throw error
}

/**
 * Creates ReadonlyRequestCookies from sample cookie data.
 * Accessing a cookie not declared in the sample will throw an error.
 * Cookies with `value: null` are declared (allowed to access) but return no value.
 */
export function createCookiesFromSample(
  sampleCookies: InstantSample['cookies'],
  route: string
): ReadonlyRequestCookies {
  const declaredNames = new Set<string>()

  const cookies = new RequestCookies(new Headers())
  if (sampleCookies) {
    for (const cookie of sampleCookies) {
      declaredNames.add(cookie.name)
      if (cookie.value !== null) {
        cookies.set(cookie.name, cookie.value)
      }
    }
  }

  const sealed = RequestCookiesAdapter.seal(cookies)

  return new Proxy(sealed, {
    get(target, prop, receiver) {
      if (prop === 'has') {
        const originalMethod = Reflect.get(target, prop, receiver)
        const wrappedMethod: typeof originalMethod = function (name) {
          if (!declaredNames.has(name)) {
            trackMissingSampleErrorAndThrow(
              createMissingCookieSampleError(route, name)
            )
          }
          return originalMethod.call(target, name)
        }
        return wrappedMethod
      }
      if (prop === 'get') {
        const originalMethod = Reflect.get(target, prop, receiver)
        const wrappedMethod: typeof originalMethod = function (nameOrCookie) {
          let name: string
          if (typeof nameOrCookie === 'string') {
            name = nameOrCookie
          } else if (
            nameOrCookie &&
            typeof nameOrCookie === 'object' &&
            typeof nameOrCookie.name === 'string'
          ) {
            name = nameOrCookie.name
          } else {
            // This is an invalid input. Pass it through to the original method so it can error.
            return originalMethod.call(target, nameOrCookie)
          }

          if (!declaredNames.has(name)) {
            trackMissingSampleErrorAndThrow(
              createMissingCookieSampleError(route, name)
            )
          }
          return originalMethod.call(target, name)
        }
        return wrappedMethod
      }

      // TODO(instant-validation-build): what should getAll do?
      // Maybe we should only allow it if there's an array (possibly empty?)

      return Reflect.get(target, prop, receiver)
    },
  })
}

function createMissingCookieSampleError(
  route: string,
  name: string
): InstantValidationError {
  return new InstantValidationError(
    `Route "${route}" accessed cookie "${name}" which is not defined in the \`samples\` ` +
      `of \`unstable_instant\`. Add it to the sample's \`cookies\` array, ` +
      `or \`{ name: "${name}", value: null }\` if it should be absent.`
  )
}

/**
 * Creates ReadonlyHeaders from sample header data.
 * Accessing a header not declared in the sample will throw an error.
 * Headers with `value: null` are declared (allowed to access) but return null.
 */
export function createHeadersFromSample(
  rawSampleHeaders: InstantSample['headers'],
  sampleCookies: InstantSample['cookies'],
  route: string
): ReadonlyHeaders {
  // If we have cookie samples, add a `cookie` header to match.
  // Accessing it will be implicitly allowed by the proxy --
  // if the user defined some cookies, accessing the "cookie" header is also fine.
  const sampleHeaders = rawSampleHeaders ? [...rawSampleHeaders] : []
  if (sampleHeaders.find(([name]) => name.toLowerCase() === 'cookie')) {
    throw new InstantValidationError(
      'Invalid sample: Defining cookies via a "cookie" header is not supported. Use `cookies: [{ name: ..., value: ... }]` instead.'
    )
  }
  if (sampleCookies) {
    const cookieHeaderValue = sampleCookies.toString()
    sampleHeaders.push([
      'cookie',
      // if the `cookies` samples were empty, or they were all `null`, then we have no cookies,
      // and the header isn't present, but should remains readable, so we set it to null.
      cookieHeaderValue !== '' ? cookieHeaderValue : null,
    ])
  }

  const declaredNames = new Set<string>()
  const headersInit: Record<string, string> = {}

  for (const [name, value] of sampleHeaders) {
    declaredNames.add(name.toLowerCase())
    if (value !== null) {
      headersInit[name.toLowerCase()] = value
    }
  }

  const sealed = HeadersAdapter.seal(HeadersAdapter.from(headersInit))

  return new Proxy(sealed, {
    get(target, prop, receiver) {
      if (prop === 'get' || prop === 'has') {
        const originalMethod = Reflect.get(target, prop, receiver)
        const patchedMethod: typeof originalMethod = function (rawName) {
          const name = rawName.toLowerCase()
          if (!declaredNames.has(name)) {
            trackMissingSampleErrorAndThrow(
              new InstantValidationError(
                `Route "${route}" accessed header "${name}" which is not defined in the \`samples\` ` +
                  `of \`unstable_instant\`. Add it to the sample's \`headers\` array, ` +
                  `or \`["${name}", null]\` if it should be absent.`
              )
            )
          }
          // typescript can't reconcile a union of functions with a union of return types,
          // so we have to cast the original return type away
          return (originalMethod as (...args: any[]) => any).call(target, name)
        }
        return patchedMethod
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

/**
 * Creates a DraftModeProvider that always returns isEnabled: false.
 */
export function createDraftModeForValidation(): DraftModeProvider {
  // Create a minimal DraftModeProvider-compatible object
  // that always reports draft mode as disabled.
  //
  // private properties that can't be set from outside the class.
  return {
    get isEnabled() {
      return false
    },
    enable() {
      throw new Error(
        'Draft mode cannot be enabled during build-time instant validation.'
      )
    },
    disable() {
      throw new Error(
        'Draft mode cannot be disabled during build-time instant validation.'
      )
    },
  } as Partial<DraftModeProvider> as DraftModeProvider
}

/**
 * Creates params wrapped with an exhaustive proxy.
 * Accessing a param not declared in the sample will throw an error.
 */
export function createExhaustiveParamsProxy<TParams extends Params>(
  underlyingParams: TParams,
  declaredParamNames: Set<string>,
  route: string
): TParams {
  return new Proxy(underlyingParams, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        !wellKnownProperties.has(prop) &&
        // Only error when accessing a param that is part of the route but wasn't provided.
        // accessing properties that aren't expected to be a valid param value is fine.
        prop in underlyingParams &&
        !declaredParamNames.has(prop)
      ) {
        trackMissingSampleErrorAndThrow(
          new InstantValidationError(
            `Route "${route}" accessed param "${prop}" which is not defined in the \`samples\` ` +
              `of \`unstable_instant\`. Add it to the sample's \`params\` object.`
          )
        )
      }
      return Reflect.get(target, prop, receiver)
    },
    // We don't need to override `has` or `ownKeys`.
    // the shape of the params object is determined by the routing structure
    // and independent of the samples. We only need to instrument accessing the values.
  })
}

/**
 * Creates searchParams wrapped with an exhaustive proxy.
 * Accessing a searchParam not declared in the sample will throw an error.
 * A searchParam with `value: undefined` means "declared but absent" (allowed to access, returns undefined).
 */
export function createExhaustiveSearchParamsProxy(
  searchParams: SearchParams,
  declaredSearchParamNames: Set<string>,
  route: string
): SearchParams {
  return new Proxy(searchParams, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        !wellKnownProperties.has(prop) &&
        !declaredSearchParamNames.has(prop)
      ) {
        trackMissingSampleErrorAndThrow(
          createMissingSearchParamSampleError(route, prop)
        )
      }
      return Reflect.get(target, prop, receiver)
    },
    has(target, prop) {
      if (
        typeof prop === 'string' &&
        !wellKnownProperties.has(prop) &&
        !declaredSearchParamNames.has(prop)
      ) {
        trackMissingSampleErrorAndThrow(
          createMissingSearchParamSampleError(route, prop)
        )
      }
      return Reflect.has(target, prop)
    },
  })
}

/**
 * Wraps a URLSearchParams (or subclass like ReadonlyURLSearchParams) with an
 * exhaustive proxy. Accessing a search param not declared in the sample via
 * get/getAll/has will throw an error.
 */
export function createExhaustiveURLSearchParamsProxy<T extends URLSearchParams>(
  searchParams: T,
  declaredSearchParamNames: Set<string>,
  route: string
): T {
  return new Proxy(searchParams, {
    get(target, prop, receiver) {
      // Intercept method calls that access specific param names
      if (prop === 'get' || prop === 'getAll' || prop === 'has') {
        const originalMathod = Reflect.get(target, prop, receiver)
        return (name: string) => {
          if (typeof name === 'string' && !declaredSearchParamNames.has(name)) {
            trackMissingSampleErrorAndThrow(
              createMissingSearchParamSampleError(route, name)
            )
          }
          return (originalMathod as (...args: any[]) => any).call(target, name)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      // Prevent `TypeError: Value of "this" must be of type URLSearchParams` for methods
      if (typeof value === 'function' && !Object.hasOwn(target, prop)) {
        return value.bind(target)
      }
      return value
    },
  })
}

function createMissingSearchParamSampleError(
  route: string,
  name: string
): InstantValidationError {
  return new InstantValidationError(
    `Route "${route}" accessed searchParam "${name}" which is not defined in the \`samples\` ` +
      `of \`unstable_instant\`. Add it to the sample's \`searchParams\` object, ` +
      `or \`{ "${name}": null }\` if it should be absent.`
  )
}

export function createRelativeURLFromSamples(
  route: string,
  sampleParams: InstantSample['params'],
  sampleSearchParams: InstantSample['searchParams']
) {
  // Build searchParams query object and URL search string from sample
  const pathname = createPathnameFromRouteAndSampleParams(
    route,
    sampleParams ?? {}
  )

  let search = ''
  if (sampleSearchParams) {
    const qs = createURLSearchParamsFromSample(sampleSearchParams).toString()
    if (qs) {
      search = '?' + qs
    }
  }

  return parseRelativeUrl(pathname + search, undefined, true)
}

function createURLSearchParamsFromSample(
  sampleSearchParams: InstantSample['searchParams']
) {
  const result = new URLSearchParams()
  if (sampleSearchParams) {
    for (const [key, value] of Object.entries(sampleSearchParams)) {
      if (value === null || value === undefined) continue
      if (Array.isArray(value)) {
        for (const v of value) {
          result.append(key, v)
        }
      } else {
        result.set(key, value)
      }
    }
  }
  return result
}

/**
 * Substitute sample params into `workStore.route` to create a plausible pathname.
 * TODO(instant-validation-build): this logic is somewhat hacky and likely incomplete,
 * but it should be good enough for some initial testing.
 */
function createPathnameFromRouteAndSampleParams(route: string, params: Params) {
  let interpolatedSegments: string[] = []
  const rawSegments = route.split('/')
  for (const rawSegment of rawSegments) {
    const param = getSegmentParam(rawSegment)
    if (param) {
      switch (param.paramType) {
        case 'catchall':
        case 'optional-catchall': {
          let paramValue = params[param.paramName]
          if (paramValue === undefined) {
            // The value for the param was not provided. `usePathname` will detect this and throw
            // before this can surface to userspace. Use `[...NAME]` as a placeholder for the param value
            // in case it pops up somewhere unexpectedly.
            paramValue = [rawSegment]
          } else if (!Array.isArray(paramValue)) {
            // NOTE: this happens outside of render, so we don't need `trackMissingSampleErrorAndThrow`
            throw new InstantValidationError(
              `Expected sample param value for segment '${rawSegment}' to be an array of strings, got ${typeof paramValue}`
            )
          }
          interpolatedSegments.push(
            ...paramValue.map((v) => encodeURIComponent(v))
          )
          break
        }
        case 'dynamic': {
          let paramValue = params[param.paramName]
          if (paramValue === undefined) {
            // The value for the param was not provided. `usePathname` will detect this and throw
            // before this can surface to userspace. Use `[NAME]` as a placeholder for the param value
            // in case it pops up somewhere unexpectedly.
            paramValue = rawSegment
          } else if (typeof paramValue !== 'string') {
            // NOTE: this happens outside of render, so we don't need `trackMissingSampleErrorAndThrow`
            throw new InstantValidationError(
              `Expected sample param value for segment '${rawSegment}' to be a string, got ${typeof paramValue}`
            )
          }
          interpolatedSegments.push(encodeURIComponent(paramValue))
          break
        }
        case 'catchall-intercepted-(..)(..)':
        case 'catchall-intercepted-(.)':
        case 'catchall-intercepted-(..)':
        case 'catchall-intercepted-(...)':
        case 'dynamic-intercepted-(..)(..)':
        case 'dynamic-intercepted-(.)':
        case 'dynamic-intercepted-(..)':
        case 'dynamic-intercepted-(...)': {
          // TODO(instant-validation-build): i don't know how these are supposed to work, or if we can even get them here
          throw new InvariantError(
            'Not implemented: Validation of interception routes'
          )
        }
        default: {
          param.paramType satisfies never
        }
      }
    } else {
      interpolatedSegments.push(rawSegment)
    }
  }
  return interpolatedSegments.join('/')
}

export function assertRootParamInSamples(
  workStore: WorkStore,
  sampleParams: Params | undefined,
  paramName: string
) {
  if (sampleParams && paramName in sampleParams) {
    // The param is defined in the samples.
  } else {
    const route = workStore.route
    trackMissingSampleErrorAndThrow(
      new InstantValidationError(
        `Route "${route}" accessed root param "${paramName}" which is not defined in the \`samples\` ` +
          `of \`unstable_instant\`. Add it to the sample's \`params\` object.`
      )
    )
  }
}
