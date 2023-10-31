import { normalizeLocalePath } from '../../i18n/normalize-locale-path'
import { removePathPrefix } from './remove-path-prefix'
import { pathHasPrefix } from './path-has-prefix'
import type { I18NProvider } from '../../../../server/future/helpers/i18n-provider'

export interface NextPathnameInfo {
  /**
   * The base path in case the pathname included it.
   */
  basePath?: string
  /**
   * The buildId for when the parsed URL is a data URL. Parsing it can be
   * disabled with the `parseData` option.
   */
  buildId?: string
  /**
   * If there was a locale in the pathname, this will hold its value.
   */
  locale?: string
  /**
   * The processed pathname without a base path, locale, or data URL elements
   * when parsing it is enabled.
   */
  pathname: string
  /**
   * A boolean telling if the pathname had a trailingSlash. This can be only
   * true if trailingSlash is enabled.
   */
  trailingSlash?: boolean
}

interface Options {
  /**
   * When passed to true, this function will also parse Nextjs data URLs.
   */
  parseData?: boolean
  /**
   * A partial of the Next.js configuration to parse the URL.
   */
  nextConfig?: {
    basePath?: string
    i18n?: { locales?: string[] } | null
    trailingSlash?: boolean
  }

  /**
   * If provided, this normalizer will be used to detect the locale instead of
   * the default locale detection.
   */
  i18nProvider?: I18NProvider
}

export function getNextPathnameInfo(
  pathname: string,
  options: Options
): NextPathnameInfo {
  const { basePath, i18n, trailingSlash } = options.nextConfig ?? {}
  const info: NextPathnameInfo = {
    pathname,
    trailingSlash: pathname !== '/' ? pathname.endsWith('/') : trailingSlash,
  }

  if (basePath && pathHasPrefix(info.pathname, basePath)) {
    info.pathname = removePathPrefix(info.pathname, basePath)
    info.basePath = basePath
  }
  let pathnameNoDataPrefix = info.pathname

  if (
    info.pathname.startsWith('/_next/data/') &&
    info.pathname.endsWith('.json')
  ) {
    const paths = info.pathname
      .replace(/^\/_next\/data\//, '')
      .replace(/\.json$/, '')
      .split('/')

    const buildId = paths[0]
    info.buildId = buildId
    pathnameNoDataPrefix =
      paths[1] !== 'index' ? `/${paths.slice(1).join('/')}` : '/'

    // update pathname with normalized if enabled although
    // we use normalized to populate locale info still
    if (options.parseData === true) {
      info.pathname = pathnameNoDataPrefix
    }
  }

  // If provided, use the locale route normalizer to detect the locale instead
  // of the function below.
  if (i18n) {
    let result = options.i18nProvider
      ? options.i18nProvider.analyze(info.pathname)
      : normalizeLocalePath(info.pathname, i18n.locales)

    info.locale = result.detectedLocale
    info.pathname = result.pathname ?? info.pathname

    if (!result.detectedLocale && info.buildId) {
      result = options.i18nProvider
        ? options.i18nProvider.analyze(pathnameNoDataPrefix)
        : normalizeLocalePath(pathnameNoDataPrefix, i18n.locales)

      if (result.detectedLocale) {
        info.locale = result.detectedLocale
      }
    }
  }
  return info
}
