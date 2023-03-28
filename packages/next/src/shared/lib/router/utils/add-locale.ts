import { addPathPrefix } from './add-path-prefix'
import { pathHasPrefix } from './path-has-prefix'

/**
 * For a given path and a locale, if the locale is given, it will prefix the
 * locale. The path shouldn't be an API path. If a default locale is given the
 * prefix will be omitted if the locale is already the default locale.
 */
export function addLocale(
  path: string,
  locale?: string | false,
  defaultLocale?: string,
  ignorePrefix?: boolean
) {
  // If no locale was given or the locale is the default locale, we don't need
  // to prefix the path.
  if (!locale || locale === defaultLocale) return path

  const lower = path.toLowerCase()

  // If the path is an API path or the path already has the locale prefix, we
  // don't need to prefix the path.
  if (!ignorePrefix) {
    if (pathHasPrefix(lower, '/api')) return path
    if (pathHasPrefix(lower, `/${locale.toLowerCase()}`)) return path
  }

  // Add the locale prefix to the path.
  return addPathPrefix(path, `/${locale}`)
}
