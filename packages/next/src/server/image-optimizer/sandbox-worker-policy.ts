import { existsSync, realpathSync, statSync } from 'fs'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'

// These are trusted runtime directories, not filename-based exceptions.
// Everything under them is readable; do not store secrets there.
const RUNTIME_DIRECTORIES = {
  darwin: [
    '/System/Library',
    '/usr/lib',
    '/usr/local/lib',
    '/usr/local/Cellar',
    '/usr/local/opt',
    '/opt/homebrew/lib',
    '/opt/homebrew/Cellar',
    '/opt/homebrew/opt',
  ],
  linux: ['/lib', '/lib64', '/usr/lib', '/usr/lib64', '/usr/local/lib'],
}

export function getImageOptimizerSandboxConfig(
  workerPath = require.resolve('./sandbox-worker-child'),
  readAllowlist?: string[]
): SandboxRuntimeConfig {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error(
      `Sandboxed image optimization is not supported on ${process.platform}`
    )
  }

  const paths = new Set<string>()
  const addPath = (value: string, optional = false) => {
    if (!isAbsolute(value) || /[[\]*?]/.test(value)) {
      throw new Error('Image sandbox read paths must be absolute without globs')
    }
    if (optional && !existsSync(value)) return
    const resolved = realpathSync(value)
    // sandbox-runtime interprets glob characters even in literal paths.
    if (/[[\]*?]/.test(resolved)) {
      throw new Error('Image sandbox read paths must be absolute without globs')
    }
    paths.add(value)
    paths.add(resolved)
  }

  for (const directory of readAllowlist ??
    RUNTIME_DIRECTORIES[process.platform]) {
    addPath(directory, readAllowlist === undefined)
  }

  addPath(process.execPath)
  addPath('/bin/sh')
  addPath('/usr/bin/env')
  addPath(workerPath)
  // In a source checkout Next itself is outside node_modules.
  const nextPackageRoot = resolve(__dirname, '..', '..', '..')
  addPath(join(nextPackageRoot, 'dist'))
  addPath(join(nextPackageRoot, 'package.json'))

  // Preserve Node resolution, including pnpm's physical store paths, without
  // granting the surrounding project or home directory.
  for (const entry of [workerPath, __filename, require.resolve('sharp')]) {
    let directory = dirname(realpathSync(entry))
    for (;;) {
      if (basename(directory) === 'node_modules') addPath(directory)
      const dependencies = join(directory, 'node_modules')
      if (existsSync(dependencies) && statSync(dependencies).isDirectory()) {
        addPath(dependencies)
      }
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
  }

  // Loader/timezone metadata and devices are needed independently of the
  // installation-specific runtime directories above.
  const supportPaths =
    process.platform === 'darwin'
      ? ['/private/var/db/timezone', '/private/var/select/sh', '/dev']
      : ['/etc/ld.so.cache', '/etc/localtime', '/usr/share/zoneinfo', '/dev']
  for (const file of supportPaths) addPath(file, true)

  return {
    network: { allowedDomains: [], deniedDomains: [] },
    filesystem: {
      denyRead: ['/'],
      allowRead: [...paths],
      allowWrite: [],
      denyWrite: [],
    },
  }
}
