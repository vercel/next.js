import type { CompiledTestRoute, TestProfile } from '../contracts'
import type { Params } from '../../../server/request/params'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getSegmentParam } from '../../../shared/lib/router/utils/get-segment-param'
import { getDynamicParam } from '../../../shared/lib/router/utils/get-dynamic-param'
import { dynamicParamTypes } from '../../../server/app-render/get-short-dynamic-param-type'

const dynamic = ['auto', 'force-dynamic', 'force-static', 'error']
const fetchCache = [
  'auto',
  'default-cache',
  'only-cache',
  'force-cache',
  'default-no-store',
  'only-no-store',
  'force-no-store',
]

/** Native facts are required; a configured route string alone is not evidence. */
export function validateCompiledTestRoute(
  value: unknown,
  profile: TestProfile
): asserts value is CompiledTestRoute {
  const route = value as CompiledTestRoute | undefined
  if (
    profile.environment !== 'rsc' ||
    !['development', 'production'].includes(profile.mode) ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    !profile.route ||
    !route ||
    route.version !== 1 ||
    route.pathname !== profile.route ||
    route.runtime !== 'nodejs' ||
    typeof route.page !== 'string' ||
    !route.page.startsWith('/') ||
    !route.page.endsWith('/page') ||
    normalizeAppPath(route.page) !== route.pathname ||
    typeof route.basePath !== 'string' ||
    (route.basePath !== '' &&
      (!route.basePath.startsWith('/') || route.basePath.endsWith('/'))) ||
    !Array.isArray(route.rootParamNames) ||
    !route.rootParamNames.every(
      (key) => typeof key === 'string' && key.length > 0
    ) ||
    new Set(route.rootParamNames).size !== route.rootParamNames.length ||
    !route.config ||
    !dynamic.includes(route.config.dynamic) ||
    !fetchCache.includes(route.config.fetchCache) ||
    route.config.dynamicParams !== true ||
    !(
      route.config.revalidate === false ||
      route.config.revalidate === 'force-cache' ||
      (typeof route.config.revalidate === 'number' &&
        Number.isSafeInteger(route.config.revalidate) &&
        route.config.revalidate >= 0)
    ) ||
    !route.entry ||
    !isSource(route.entry) ||
    !Array.isArray(route.sources) ||
    !route.sources.length ||
    !route.sources.every(isSource) ||
    new Set(route.sources.map((source) => source.file)).size !==
      route.sources.length
  ) {
    throw new Error(
      'RSC route rendering requires matching native AppProject route metadata.'
    )
  }
  const groups = getRouteRegex(route.pathname).groups
  if (route.rootParamNames.some((name) => !Object.hasOwn(groups, name))) {
    throw new Error(
      'Compiled RSC root parameters do not belong to the selected route.'
    )
  }
}

function isSource(value: { file: string; sha256: string }): boolean {
  return Boolean(
    value &&
      typeof value.file === 'string' &&
      value.file &&
      !value.file.includes('\\') &&
      !value.file.includes(':') &&
      !value.file
        .split('/')
        .some((part) => !part || part === '.' || part === '..') &&
      typeof value.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(value.sha256)
  )
}

function sameParams(actual: unknown, expected: Params): boolean {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual))
    return false
  const keys = Object.keys(actual)
  return (
    keys.length === Object.keys(expected).length &&
    keys.every((key) => {
      if (!Object.hasOwn(expected, key)) return false
      const a = (actual as Params)[key],
        b = expected[key]
      return Array.isArray(a) && Array.isArray(b)
        ? a.length === b.length && a.every((value, index) => value === b[index])
        : a === b
    })
  )
}

/** Uses Next's normal decoded route matcher; no layout/router state is fabricated. */
export async function resolveCompiledRouteRequest(
  route: CompiledTestRoute,
  url: URL,
  suppliedParams: unknown,
  suppliedRootParams: Params | undefined,
  signal: AbortSignal
): Promise<{ params: Params; rootParams: Params }> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('RSC route request requires an HTTP or HTTPS URL.')
  const pathname = route.basePath
    ? url.pathname.startsWith(`${route.basePath}/`) ||
      url.pathname === route.basePath
      ? url.pathname.slice(route.basePath.length) || '/'
      : undefined
    : url.pathname
  const params =
    pathname === undefined
      ? false
      : getRouteMatcher(getRouteRegex(route.pathname))(pathname)
  if (!params)
    throw new Error(
      'RSC request URL does not match the selected AppProject route.'
    )
  if (suppliedParams !== undefined) {
    let abort!: () => void
    const cancelled = new Promise<never>((_, reject) => {
      abort = () =>
        reject(signal.reason ?? new Error('RSC route request aborted.'))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
    try {
      const supplied = await Promise.race([
        Promise.resolve(suppliedParams),
        cancelled,
      ])
      if (!sameParams(supplied, params))
        throw new Error('RSC component params do not match its request URL.')
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }
  const rootParams: Params = {}
  for (const name of route.rootParamNames) rootParams[name] = params[name]
  if (
    suppliedRootParams !== undefined &&
    !sameParams(suppliedRootParams, rootParams)
  ) {
    throw new Error(
      'RSC rootParams do not match the selected loader tree and request URL.'
    )
  }
  signal.throwIfAborted()
  return { params, rootParams }
}

/** Match app-render's user-facing dynamic values after logical URL validation. */
export function createCompiledRouteRenderParams(
  route: CompiledTestRoute,
  logicalParams: Params
): { params: Params; rootParams: Params } {
  const params: Params = {}
  // These are the native AppProject page segments, including route groups.
  // getDynamicParam applies the same single encoding step as app-render.
  for (const segment of route.page.split('/')) {
    const parameter = getSegmentParam(segment)
    if (!parameter) continue
    const dynamicParameter = getDynamicParam(
      logicalParams,
      parameter.paramName,
      dynamicParamTypes[parameter.paramType],
      null,
      null
    )
    if (dynamicParameter.value !== null)
      params[dynamicParameter.param] = dynamicParameter.value
  }
  const rootParams: Params = {}
  for (const name of route.rootParamNames) {
    if (Object.hasOwn(params, name)) rootParams[name] = params[name]
  }
  return { params, rootParams }
}
