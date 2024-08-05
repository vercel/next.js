import isError from '../is-error'
import { execSync } from 'child_process'
import { getPkgManager } from './get-pkg-manager'
import { getFormattedNodeOptionsWithoutInspect } from '../../server/lib/utils'

/**
 * Returns the package registry using the user's package manager.
 * The URL will have a trailing slash.
 * @default https://registry.npmjs.org/
 */
export function getRegistry(baseDir: string = process.cwd()) {
  let registry = `https://registry.npmjs.org/`
  try {
    const pkgManager = getPkgManager(baseDir)
    const output = execSync(`${pkgManager} config get registry`, {
      env: {
        ...process.env,
        NODE_OPTIONS: getFormattedNodeOptionsWithoutInspect(),
      },
    })
      .toString()
      .trim()

    if (output.startsWith('http')) {
      registry = output.endsWith('/') ? output : `${output}/`
    }
  } catch (error) {
    // In an npm workspace, `npm config get registry` will throw error code ENOWORKSPACES
    // As this is NPM specific error, we ignore and use the default NPM registry.
    // x-ref: https://github.com/vercel/next.js/issues/47121#issuecomment-1499044345
    if (isError(error) && error.code !== 'ENOWORKSPACES') {
      throw error
    }
  }

  return registry
}
