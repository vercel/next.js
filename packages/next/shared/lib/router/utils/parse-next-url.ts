import { getCookieParser } from '../../../../server/api-utils'
import { getLocaleMetadata } from '../../i18n/get-locale-metadata'
import { parseUrl } from './parse-url'
import type { NextConfig, DomainLocale } from '../../../../server/config-shared'
import type { ParsedUrl } from './parse-url'
import type { PathLocale } from '../../i18n/normalize-locale-path'

interface Params {
  headers?: { [key: string]: string | string[] | undefined }
  nextConfig: NextConfig
  url?: string
}

export function parseNextUrl({ headers, nextConfig, url = '/' }: Params) {
  const urlParsed: ParsedNextUrl = parseUrl(url)
  const { basePath } = nextConfig

  if (basePath && urlParsed.pathname.startsWith(basePath)) {
    urlParsed.pathname = urlParsed.pathname.replace(basePath, '') || '/'
    urlParsed.basePath = basePath
  }

  if (nextConfig.i18n) {
    urlParsed.locale = getLocaleMetadata({
      cookies: getCookieParser(headers || {}),
      headers: headers,
      nextConfig: {
        basePath: nextConfig.basePath,
        i18n: nextConfig.i18n,
        trailingSlash: nextConfig.trailingSlash,
      },
      url: urlParsed,
    })

    if (urlParsed.locale?.path.detectedLocale) {
      urlParsed.pathname = urlParsed.locale.path.pathname
    }
  }

  return urlParsed
}

export interface ParsedNextUrl extends ParsedUrl {
  basePath?: string
  locale?: {
    defaultLocale: string
    domain?: DomainLocale
    locale: string
    path: PathLocale
    redirect?: string
    trailingSlash?: boolean
  }
}
