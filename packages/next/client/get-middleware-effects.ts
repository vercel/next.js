import type { ParsedRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import { parseRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { resolveDynamicRoute } from './resolve-dynamic-route'

type PreflightEffect =
  | { type: 'rewrite'; parsedAs: ParsedRelativeUrl; resolvedHref: string }
  | { type: 'redirect'; newUrl: string; newAs: string }
  | { type: 'redirect'; destination: string }
  | { type: 'next' }

interface Options {
  source: string
  nextConfig: {
    basePath?: string
    i18n?: { locales?: string[] }
    trailingSlash?: boolean
  }
  pages: string[]
}

export function getMiddlewareEffects(
  preflightData: { redirect?: string | null; rewrite?: string | null },
  options: Options
): PreflightEffect {
  if (preflightData.rewrite) {
    if (!preflightData.rewrite.startsWith('/')) {
      return {
        type: 'redirect' as const,
        destination: options.source,
      }
    }

    const parsedRewrite = parseDestination(preflightData.rewrite, options)
    return {
      type: 'rewrite' as const,
      parsedAs: parsedRewrite.parsed,
      resolvedHref: parsedRewrite.resolvedHref,
    }
  }

  if (preflightData.redirect) {
    if (!preflightData.redirect.startsWith('/')) {
      return {
        type: 'redirect' as const,
        destination: preflightData.redirect,
      }
    }

    return {
      type: 'redirect' as const,
      newAs: preflightData.redirect,
      newUrl: preflightData.redirect,
    }
  }

  return {
    type: 'next' as const,
  }
}

function parseDestination(destination: string, options: Options) {
  const parsed = parseRelativeUrl(destination)
  const info = getNextPathnameInfo(parsed.pathname, {
    nextConfig: options.nextConfig,
    parseData: true,
  })

  parsed.pathname = info.pathname
  const fsPathname = removeTrailingSlash(info.pathname)
  const resolvedHref = !options.pages.includes(fsPathname)
    ? resolveDynamicRoute(fsPathname, options.pages)
    : fsPathname

  return {
    resolvedHref,
    parsed,
  }
}
