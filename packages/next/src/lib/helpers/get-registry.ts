import { execSync } from 'child_process'
import { getPkgManager } from './get-pkg-manager'

/**
 * Returns the package registry using the user's package manager.
 * The URL will have a trailing slash.
 * @default https://registry.npmjs.org/
 */
export function getRegistry(baseDir: string = process.cwd()) {
  let registry = `https://registry.npmjs.org/`
  try {
    const pkgManager = getPkgManager(baseDir)
    const output = execSync(`${pkgManager} config get registry`)
      .toString()
      .trim()

    if (output.startsWith('http')) {
      registry = output.endsWith('/') ? output : `${output}/`
    }
  } finally {
    return registry
  }
}
