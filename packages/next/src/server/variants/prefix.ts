import { VARIANTS_PATH_PREFIX } from '../../lib/constants'

/**
 * Inserts the packed variant values as a path prefix, after `basePath` so that
 * the prefix wraps the entire remaining public path (including any locale
 * segment) and the transform stays uniform regardless of i18n.
 *
 * The result is an internal pathname that is stripped again by
 * `VariantsPathnameNormalizer` before route resolution, and is never visible to
 * the client.
 */
export function insertVariantsPrefix(
  pathname: string,
  packedVariants: string,
  basePath?: string
): string {
  const prefix = `/${VARIANTS_PATH_PREFIX}/${packedVariants}`

  if (basePath && basePath !== '/' && pathname.startsWith(basePath)) {
    const rest = pathname.slice(basePath.length)
    return `${basePath}${prefix}${rest.startsWith('/') ? rest : `/${rest}`}`
  }

  return pathname === '/' ? prefix : `${prefix}${pathname}`
}
