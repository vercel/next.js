import { execSync } from 'child_process'
import { getPkgManager } from './get-pkg-manager'
import { getFormattedNodeOptionsWithoutInspect } from '../../server/lib/utils'

/**
 * Returns the package registry using the user's package manager.
 * The URL will have a trailing slash.
 * @default https://registry.npmjs.org/
 */
export function getRegistry(baseDir: string = process.cwd()): {
  registry: string
  authToken?: string
} {
  const pkgManager = getPkgManager(baseDir)
  // Since `npm config` command fails in npm workspace to prevent workspace config conflicts,
  // add `--no-workspaces` flag to run under the context of the root project only.
  // Safe for non-workspace projects as it's equivalent to default `--workspaces=false`.
  // x-ref: https://github.com/vercel/next.js/issues/47121#issuecomment-1499044345
  // x-ref: https://github.com/npm/statusboard/issues/371#issue-920669998
  const resolvedFlags = pkgManager === 'npm' ? '--no-workspaces' : ''
  let registry = `https://registry.npmjs.org/`

  try {
    const output = execSync(
      `${pkgManager} config get registry ${resolvedFlags}`,
      {
        env: {
          ...process.env,
          NODE_OPTIONS: getFormattedNodeOptionsWithoutInspect(),
        },
      }
    )
      .toString()
      .trim()

    if (output.startsWith('http')) {
      registry = output.endsWith('/') ? output : `${output}/`
    }
  } catch (err) {
    throw new Error(`Failed to get registry from "${pkgManager}".`, {
      cause: err,
    })
  }

  // Read auth token for this registry from .npmrc, if configured.
  let authToken: string | undefined
  try {
    const parsed = new URL(registry)
    let scope = `//${parsed.host}${parsed.pathname}`
    if (!scope.endsWith('/')) scope += '/'

    const output = execSync(
      `${pkgManager} config get "${scope}:_authToken" ${resolvedFlags}`,
      {
        env: {
          ...process.env,
          NODE_OPTIONS: getFormattedNodeOptionsWithoutInspect(),
        },
      }
    )
      .toString()
      .trim()

    if (output && output !== 'undefined') {
      authToken = output
    }
  } catch {
    // Auth token is not required — proceed without it
  }

  return { registry, authToken }
}
