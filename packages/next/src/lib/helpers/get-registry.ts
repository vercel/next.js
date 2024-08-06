import isError from '../is-error'
import { execSync } from 'child_process'
import { getPkgManager } from './get-pkg-manager'
import { getFormattedNodeOptionsWithoutInspect } from '../../server/lib/utils'

function runConfigGetRegistry(pkgManager: string, flags?: string[]) {
  const resolvedFlags = flags ? flags.join(' ') : ''
  return execSync(`${pkgManager} config get registry ${resolvedFlags}`, {
    env: {
      ...process.env,
      NODE_OPTIONS: getFormattedNodeOptionsWithoutInspect(),
    },
  })
    .toString()
    .trim()
}

function addTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`
}

/**
 * Returns the package registry using the user's package manager.
 * The URL will have a trailing slash.
 * @default https://registry.npmjs.org/
 */
export function getRegistry(baseDir: string = process.cwd()) {
  const pkgManager = getPkgManager(baseDir)
  let registry = `https://registry.npmjs.org/`

  try {
    const output = runConfigGetRegistry(pkgManager)

    if (output.startsWith('http')) {
      registry = addTrailingSlash(output)
    }
  } catch (error) {
    // `npm config` command fails in npm workspace to prevent workspace config conflicts.
    // x-ref: https://github.com/vercel/next.js/issues/47121#issuecomment-1499044345
    if (isError(error) && error.code !== 'ENOWORKSPACES') {
      throw error
    }

    try {
      // x-ref: https://github.com/npm/cli/issues/6099#issuecomment-1847584792
      const output = runConfigGetRegistry(pkgManager, [
        '--workspaces=false',
        '--include-workspace-root',
      ])

      if (output.startsWith('http')) {
        registry = addTrailingSlash(output)
      }
    } catch (e) {
      throw e
    }
  }

  return registry
}
