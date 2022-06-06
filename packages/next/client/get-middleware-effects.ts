import type { ParsedRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { formatNextPathnameInfo } from '../shared/lib/router/utils/format-next-pathname-info'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import { parsePath } from '../shared/lib/router/utils/parse-path'
import { parseRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { resolveDynamicRoute } from './resolve-dynamic-route'

export async function withMiddlewareEffects<T extends DataOutput>(
  promise: Promise<T>,
  options: Params
) {
  const dataOutput = await promise
  return {
    ...dataOutput,
    effect: getMiddlewareDataFromDataResponse(
      dataOutput.dataHref,
      dataOutput.response,
      options
    ),
  }
}

interface DataOutput {
  dataHref: string
  response: Response
}

interface Params {
  nextConfig?: {
    basePath?: string
    i18n?: { locales?: string[]; defaultLocale?: string }
    trailingSlash?: boolean
  }
  pages: string[]
}

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

function getMiddlewareDataFromDataResponse(
  source: string,
  response: Response,
  options: Params
): RewriteEffect | RedirectEffect | NextEffect {
  const rewriteTarget = response.headers.get('x-nextjs-matched-path')
  if (rewriteTarget) {
    if (rewriteTarget.startsWith('/')) {
      const parsedRewrite = parseDestination(rewriteTarget, options)
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

function parseDestination(destination: string, options: Params) {
  const parsed = parseRelativeUrl(destination)
  const pathnameInfo = getNextPathnameInfo(parsed.pathname, {
    nextConfig: options.nextConfig,
    parseData: true,
  })

  parsed.pathname = pathnameInfo.pathname
  const fsPathname = removeTrailingSlash(pathnameInfo.pathname)
  return {
    resolvedHref: !options.pages.includes(fsPathname)
      ? resolveDynamicRoute(fsPathname, options.pages)
      : fsPathname,
    parsed,
  }
}
