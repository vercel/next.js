import { existsSync } from 'node:fs'
import path from 'node:path'
import { VARIANTS_PATH_PREFIX } from '../../lib/constants'

/**
 * Returns true when a route pathname lies in the artifact namespace
 * `/__variants/`, which Variants reserves. Every route matcher excludes the
 * namespace, so a page there could never be served, and a prerendered path at
 * the pathname that routing rewrites a rejected request to would answer that
 * request with content.
 */
export function isVariantsReservedPathname(pathname: string): boolean {
  return pathname.startsWith(`/${VARIANTS_PATH_PREFIX}/`)
}

/**
 * Throws when a route or a generated path uses a reserved pathname. The build
 * calls this for every route it discovers and every path it prerenders.
 */
export function assertNotVariantsReservedPathname(
  pathname: string,
  origin: string
): void {
  if (isVariantsReservedPathname(pathname)) {
    throw new Error(
      `The path "${pathname}" from ${origin} is reserved by \`experimental.variants\`. ` +
        `Paths under "/${VARIANTS_PATH_PREFIX}/" cannot be routes.`
    )
  }
}

/**
 * Throws when the public directory has an entry named after the artifact
 * namespace. A public file is served by path before any route, so a file under
 * that entry would shadow an artifact or answer a rejected request.
 */
export function assertNoVariantsReservedPublicEntries(publicDir: string): void {
  if (existsSync(path.join(publicDir, VARIANTS_PATH_PREFIX))) {
    throw new Error(
      `The public directory has an entry at "/${VARIANTS_PATH_PREFIX}", which is reserved by \`experimental.variants\`. Remove or rename it.`
    )
  }
}
