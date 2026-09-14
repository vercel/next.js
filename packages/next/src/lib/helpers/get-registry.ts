import { execFile } from 'child_process'
import { promisify } from 'util'
import { getPkgManager } from './get-pkg-manager'
import { getFormattedNodeOptionsWithoutInspect } from '../../server/lib/utils'

const execFileAsync = promisify(execFile)

/**
 * Returns the package registry using the user's package manager.
 * The URL will have a trailing slash.
 * @default https://registry.npmjs.org/
 */
export async function getRegistry(baseDir: string = process.cwd()) {
  const pkgManager = getPkgManager(baseDir)
  // Since `npm config` command fails in npm workspace to prevent workspace config conflicts,
  // add `--no-workspaces` flag to run under the context of the root project only.
  // Safe for non-workspace projects as it's equivalent to default `--workspaces=false`.
  // x-ref: https://github.com/vercel/next.js/issues/47121#issuecomment-1499044345
  // x-ref: https://github.com/npm/statusboard/issues/371#issue-920669998
  const args = ['config', 'get', 'registry']
  if (pkgManager === 'npm') {
    args.push('--no-workspaces')
  }
  let registry = `https://registry.npmjs.org/`

  try {
    const { stdout } = await execFileAsync(pkgManager, args, {
      env: {
        ...process.env,
        NODE_OPTIONS: getFormattedNodeOptionsWithoutInspect(),
      },
    })
    const output = stdout.toString().trim()

    if (output.startsWith('http')) {
      registry = output.endsWith('/') ? output : `${output}/`
    }
  } catch (err) {
    throw new Error(`Failed to get registry from "${pkgManager}".`, {
      cause: err,
    })
  }

  return registry
}
