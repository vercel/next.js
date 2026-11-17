import path from 'path'
import { tokenizeArgs } from '../server/lib/utils'

const PACKAGE_MAP_OPTION = '--experimental-package-map'

/** The value of the last `--experimental-package-map` option in `args`. */
function findPackageMapOption(args: string[]): string | undefined {
  for (let index = args.length - 1; index >= 0; index--) {
    const arg = args[index]
    const separator = arg.indexOf('=')
    const name = separator === -1 ? arg : arg.slice(0, separator)
    // Node.js accepts underscores in place of the dashes of an option name.
    if (name.replaceAll('_', '-') !== PACKAGE_MAP_OPTION) {
      continue
    }
    return separator === -1 ? (args[index + 1] ?? '') : arg.slice(separator + 1)
  }
}

/**
 * The [package map](https://nodejs.org/api/packages.html#package-maps) that
 * Node.js was started with, which is selected by `--experimental-package-map`
 * on the command line or in `NODE_OPTIONS`. The command line takes precedence.
 */
export function getNodePackageMap(): string | undefined {
  let nodeOptions: string[] = []
  try {
    nodeOptions = tokenizeArgs(process.env.NODE_OPTIONS ?? '')
  } catch {
    // Node.js refuses to start with a value it cannot split.
  }
  const packageMap =
    findPackageMapOption(process.execArgv) ?? findPackageMapOption(nodeOptions)
  // Node.js resolves the path from the working directory.
  return packageMap ? path.resolve(packageMap) : undefined
}

/**
 * The absolute path of the package map that the bundler locates packages
 * with: the one of `experimental.turbopackPackageMap`, which is relative to
 * the project directory, or else the one Node.js was started with.
 */
export function resolvePackageMap(
  configured: string | false | undefined,
  dir: string
): string | undefined {
  if (configured === false) {
    return undefined
  }
  if (configured !== undefined) {
    return path.resolve(dir, configured)
  }
  return getNodePackageMap()
}
