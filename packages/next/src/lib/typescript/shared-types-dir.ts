import path from 'path'

import type { NextConfigComplete } from '../../server/config-shared'

/**
 * Route types are generated into one directory shared by `next dev`,
 * `next build` and `next typegen`: `{getSharedTypesDistDir(config)}/types`
 * (see `generateSharedTypes`).
 *
 * Kept separate from the generator so modules that only need the location
 * (e.g. `next test`) don't load route discovery.
 */
export function getSharedTypesDistDir(
  config: Pick<NextConfigComplete, 'output' | 'distDirRoot'>
): string {
  // With `output: 'export'`, a custom `distDir` is the export destination and
  // is replaced by every build, while build artifacts live in `.next` (see
  // `getBuildDistDir`). Keep the shared types there, too. `distDirRoot` is
  // the configured `distDir` before `next dev` appends `dev`.
  return config.output === 'export' && config.distDirRoot !== '.next'
    ? '.next'
    : config.distDirRoot
}

export function getSharedTypesDir(
  dir: string,
  config: Pick<NextConfigComplete, 'output' | 'distDirRoot'>
): string {
  return path.join(dir, getSharedTypesDistDir(config), 'types')
}
