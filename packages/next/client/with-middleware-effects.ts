import type { ParsedRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { formatNextPathnameInfo } from '../shared/lib/router/utils/format-next-pathname-info'
import { getMiddlewareRegex } from '../shared/lib/router/utils/route-regex'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { hasBasePath } from './has-base-path'
import { parsePath } from '../shared/lib/router/utils/parse-path'
import { parseRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { removeBasePath } from './remove-base-path'
import { removeLocale } from './remove-locale'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { resolveDynamicRoute } from './resolve-dynamic-route'

interface DataOutput {
  dataHref: string
  response: Response
}

interface Params<T extends DataOutput> {
  asPath: string
  fetchData: () => Promise<T>
  getMiddlewareList: () => Promise<[location: string, isSSR: boolean][]>
  getPageList: () => Promise<string[]>
  locale?: string
  nextConfig?: {
    basePath?: string
    i18n?: { locales?: string[]; defaultLocale?: string }
    trailingSlash?: boolean
  }
}

export async function withMiddlewareEffects<T extends DataOutput>(
  options: Params<T>
) {
  const matches = matchesMiddleware({
    asPath: options.asPath,
    fns: await options.getMiddlewareList(),
    locale: options.locale,
  })

  if (matches) {
    try {
      const data = await options.fetchData()
      return {
        ...data,
        effect: await getMiddlewareData(data.dataHref, data.response, options),
      }
    } catch (error) {
      // TODO: Revisit this in the future.
      // For now we will not consider middleware data errors to be fatal.
      // maybe we should revisit in the future.
    }
  }

  return null
}

export type Effect = RewriteEffect | RedirectEffect | NextEffect

export type RedirectEffect =
  | { type: 'redirect'; newAs: string; newUrl: string }
  | { type: 'redirect'; destination: string }

export type RewriteEffect = {
  parsedAs: ParsedRelativeUrl
  resolvedHref: string
  type: 'rewrite'
}

export type NextEffect = {
  type: 'next'
}

function matchesMiddleware(params: {
  fns: [location: string, isSSR: boolean][]
  asPath: string
  locale?: string
}) {
  const { pathname: asPathname } = parsePath(params.asPath)
  const cleanedAs = removeLocale(
    hasBasePath(asPathname) ? removeBasePath(asPathname) : asPathname,
    params.locale
  )

  return params.fns.some(([middleware, isSSR]) => {
    return getRouteMatcher(
      getMiddlewareRegex(middleware, {
        catchAll: !isSSR,
      })
    )(cleanedAs)
  })
}

async function getMiddlewareData<T extends DataOutput>(
  source: string,
  response: Response,
  options: Params<T>
): Promise<RewriteEffect | RedirectEffect | NextEffect> {
  const rewriteTarget = response.headers.get('x-nextjs-matched-path')
  if (rewriteTarget) {
    if (rewriteTarget.startsWith('/')) {
      const parsedRewrite = await parseDestination(rewriteTarget, options)
      return {
        type: 'rewrite' as const,
        parsedAs: parsedRewrite.parsed,
        resolvedHref: parsedRewrite.resolvedHref,
      }
    }

    const src = parsePath(source)
    const pathname = formatNextPathnameInfo({
      ...getNextPathnameInfo(src.pathname, { ...options, parseData: true }),
      defaultLocale: options.nextConfig?.i18n?.defaultLocale,
      buildId: '',
    })

    return {
      type: 'redirect' as const,
      destination: `${pathname}${src.query}${src.hash}`,
    }
  }

  const redirectTarget = response.headers.get('x-nextjs-redirect')
  if (redirectTarget) {
    if (redirectTarget.startsWith('/')) {
      const src = parsePath(redirectTarget)
      const pathname = formatNextPathnameInfo({
        ...getNextPathnameInfo(src.pathname, { ...options, parseData: true }),
        defaultLocale: options.nextConfig?.i18n?.defaultLocale,
        buildId: '',
      })

      return {
        type: 'redirect' as const,
        newAs: `${pathname}${src.query}${src.hash}`,
        newUrl: `${pathname}${src.query}${src.hash}`,
      }
    }

    return {
      type: 'redirect' as const,
      destination: redirectTarget,
    }
  }

  return { type: 'next' as const }
}

async function parseDestination<T extends DataOutput>(
  destination: string,
  options: Params<T>
) {
  const parsed = parseRelativeUrl(destination)
  const pathnameInfo = getNextPathnameInfo(parsed.pathname, {
    nextConfig: options.nextConfig,
    parseData: true,
  })

  parsed.pathname = pathnameInfo.pathname
  const fsPathname = removeTrailingSlash(pathnameInfo.pathname)
  const pages = await options.getPageList()
  return {
    resolvedHref: !pages.includes(fsPathname)
      ? resolveDynamicRoute(fsPathname, pages)
      : fsPathname,
    parsed,
  }
}
