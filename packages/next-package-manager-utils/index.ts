import { execSync } from 'node:child_process'
import { execa } from 'execa'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { lookup } from 'node:dns/promises'
import { yellow } from 'picocolors'

interface PackageManager {
  readonly name: 'npm' | 'pnpm' | 'yarn' | 'bun'
  readonly lockfile: string
  readonly registry: string
  readonly install: {
    readonly allDeps: string
    readonly addDep: string
    readonly args: {
      readonly exact: string
      readonly dev: string
      // needs to be optional because yarn doesn't have a flag for this
      readonly prod?: string
      readonly offline: string
    }
  }
}

// Define separately so it can be returned from `getPackageManager` without having to scan the `PackageManagers` list.
const npm: PackageManager = {
  name: 'npm',
  lockfile: 'package-lock.json',
  registry: 'registry.npmjs.org',
  install: {
    allDeps: 'install',
    addDep: 'install',
    args: {
      exact: '--save-exact',
      dev: '--save-dev',
      prod: '--save',
      offline: '--offline',
    },
  },
}

const PackageManagers: readonly PackageManager[] = [
  npm,
  {
    name: 'pnpm',
    lockfile: 'pnpm-lock.yaml',
    registry: 'registry.npmjs.org',
    install: {
      allDeps: 'install',
      addDep: 'add',
      args: {
        exact: '--save-exact',
        dev: '--save-dev',
        prod: '--save-prod',
        offline: '--offline',
      },
    },
  },
  {
    name: 'yarn',
    lockfile: 'yarn.lock',
    registry: 'registry.yarnpkg.com',
    install: {
      allDeps: 'install',
      addDep: 'add',
      args: {
        exact: '--exact',
        dev: '--dev',
        offline: '--offline',
      },
    },
  },
  {
    name: 'bun',
    lockfile: 'bun.lockb',
    registry: 'registry.npmjs.org',
    install: {
      allDeps: 'install',
      addDep: 'install',
      args: {
        exact: '--save-exact',
        dev: '--save-dev',
        prod: '--save',
        offline: '--offline',
      },
    },
  },
]

const detectedPackageManagerCache: Map<string, PackageManager> = new Map()

/**
 * Use this method to determine the package manager a project is using.
 * By default this function will use lockfile and user agent detection,
 * as well as utilize an internal cache. You can disable any of these
 * operations through the `options` argument. Furthermore, you can enable
 * executable detection via the options as well.
 *
 * @param baseDir The project directory
 * @param options Options controlling how the package manager should be detected
 * @returns
 */
export function getPackageManager(
  baseDir: string,
  {
    lockfileDetection = true,
    userAgentDetection = true,
    executableDetection = false,
    skipCache = false,
  } = {}
): PackageManager {
  if (!skipCache) {
    const detectedPackageManager = detectedPackageManagerCache.get(baseDir)
    if (detectedPackageManager) return detectedPackageManager
  }
  try {
    if (lockfileDetection) {
      for (const packageManager of PackageManagers) {
        const stat = statSync(join(baseDir, packageManager.lockfile), {
          throwIfNoEntry: false,
        })
        if (stat?.isFile()) {
          if (!skipCache)
            detectedPackageManagerCache.set(baseDir, packageManager)
          return packageManager
        }
      }
    }

    if (userAgentDetection) {
      const userAgent = process.env.npm_config_user_agent
      for (const packageManager of PackageManagers) {
        if (userAgent?.startsWith(packageManager.name)) {
          if (!skipCache)
            detectedPackageManagerCache.set(baseDir, packageManager)
          return packageManager
        }
      }
    }

    if (executableDetection) {
      for (const packageManager of PackageManagers) {
        if (packageManager.name === 'npm') continue // Skip `npm` as it is most likely always installed and executable
        try {
          execSync(`${packageManager.name} --version`, {
            cwd: baseDir,
            stdio: 'ignore',
          })
          if (!skipCache)
            detectedPackageManagerCache.set(baseDir, packageManager)
          return packageManager
        } catch {} // Ignore any errors thrown from executing the specified package manager
      }
    }
  } catch {
    // Ignore any errors and let the `finally` block return default (npm)
  } finally {
    if (!skipCache) detectedPackageManagerCache.set(baseDir, npm)
    return npm
  }
}

function getProxy(baseDir: string) {
  if (process.env.https_proxy) return process.env.https_proxy

  try {
    const httpsProxy = execSync('npm config get https-proxy', {
      cwd: baseDir,
      encoding: 'utf8',
    }).trim()
    return httpsProxy !== 'null' ? httpsProxy : undefined
  } catch {
    return
  }
}

/**
 * This function will determine if the current system is online and has access
 * to a specified or detected package manager registry. If the `packageManager`
 * option is not specified, this function will call `getPackageManager()` to
 * determine which registry to check. If the default registry check fails, it
 * will also attempt to check a configured proxy via the `process.env.https_proxy`
 * variable or the `https-proxy` npm config value.
 *
 * @param baseDir The project directory
 * @param packageManager A package manager to use for the registry check. Will call `getPackageManager()` if not specified.
 * @returns
 */
export async function getOnline(
  baseDir: string,
  packageManager?: PackageManager
): Promise<boolean> {
  try {
    packageManager ??= getPackageManager(baseDir)
    await lookup(packageManager.registry)
    return true
  } catch {
    const proxy = getProxy(baseDir)
    if (!proxy) return false
    try {
      const { hostname } = new URL(proxy)
      await lookup(hostname)
      return true
    } catch {
      return false
    }
  }
}

export async function install(
  baseDir: string,
  {
    dependencies = [],
    packageManager,
    isOnline,
    dev,
  }: {
    dependencies: string[]
    packageManager: PackageManager
    isOnline: boolean
    dev: boolean
  }
) {
  packageManager ??= getPackageManager(baseDir)
  isOnline ??= await getOnline(baseDir, packageManager)
  let args: string[] = []

  if (dependencies.length > 0) {
    args.push(packageManager.install.addDep)
    args.push(packageManager.install.args.exact)

    if (dev) args.push(packageManager.install.args.dev)
    else if (packageManager.install.args.prod)
      args.push(packageManager.install.args.prod)

    args.push(...dependencies)
  } else {
    args.push(packageManager.install.allDeps)

    if (!isOnline) {
      args.push(packageManager.install.args.offline)
      console.log(yellow('You appear to be offline.'))
      if (packageManager.name !== 'npm') {
        console.log(
          yellow(`Falling back to the local ${packageManager.name} cache.`)
        )
      }
      console.log()
    }
  }

  return execa(packageManager.name, args, {
    cwd: baseDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ADBLOCK: '1',
      // we set NODE_ENV to development as pnpm skips dev
      // dependencies when production
      NODE_ENV: 'development',
      DISABLE_OPENCOLLECTIVE: '1',
    },
  })
}
