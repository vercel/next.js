/**
 * @fileoverview
 *
 * Resolves the set of locally-packed workspace tarballs available to
 * `create-next-app` tests. The result is forwarded to spawned CNA
 * processes via `NEXT_TEST_PKG_PATHS` so the CNA template can install
 * siblings (`next-rspack`, `eslint-config-next`, ...) from their own
 * tarballs without reverse-engineering the repo layout.
 */

import { existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

const REPO_PACKAGES_DIR = resolve(__dirname, '../../../..', 'packages')

/**
 * Returns a Map of <packageName, absolutePathToPackedTarball> for every
 * locally-packed workspace package available to tests.
 *
 * Resolution order:
 * 1. `NEXT_TEST_PKG_PATHS` (JSON, set by `run-tests.js`).
 * 2. Discovery from the repo's `packages/<name>/packed.tgz` files (used
 *    when running jest directly via `pnpm test-start-turbo` etc.).
 *
 * Returns `null` when no source is available, so callers can produce
 * targeted error messages.
 */
export function resolveTestPkgPaths(): Map<string, string> | null {
  if (process.env.NEXT_TEST_PKG_PATHS) {
    return new Map<string, string>(JSON.parse(process.env.NEXT_TEST_PKG_PATHS))
  }

  if (!existsSync(REPO_PACKAGES_DIR)) return null

  const map = new Map<string, string>()
  for (const entry of readdirSync(REPO_PACKAGES_DIR)) {
    const tarballPath = join(REPO_PACKAGES_DIR, entry, 'packed.tgz')
    if (!existsSync(tarballPath)) continue
    // Map by the published package name read from `package.json` so that
    // entries like `eslint-config-next` are keyed correctly even when the
    // directory name differs.
    const pkgJsonPath = join(REPO_PACKAGES_DIR, entry, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    const { name } = require(pkgJsonPath)
    if (typeof name === 'string' && name.length > 0) {
      map.set(name, tarballPath)
    }
  }

  return map.size > 0 ? map : null
}

/**
 * Serializes the test pkg paths so they can be forwarded to a spawned
 * `create-next-app` process via `NEXT_TEST_PKG_PATHS`. Used to keep the
 * CNA template free of repo-layout assumptions when tests are run
 * directly (e.g. `pnpm test-start-turbo`) instead of via run-tests.js.
 */
export function serializeTestPkgPathsEnv(): string | undefined {
  if (process.env.NEXT_TEST_PKG_PATHS) return process.env.NEXT_TEST_PKG_PATHS
  const map = resolveTestPkgPaths()
  if (!map) return undefined
  return JSON.stringify(Array.from(map.entries()))
}
