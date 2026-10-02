import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import * as CommentJson from 'next/dist/compiled/comment-json'

export type RelevantCompilerOptions = {
  paths?: Record<string, string[]>
  /** Absolute path for an explicitly configured baseUrl. */
  baseUrl?: string
  /** Absolute directory containing an inherited paths option without baseUrl. */
  pathsBasePath?: string
}

function resolveConfigDirValue(
  value: string,
  configDir: string,
  rootConfigDir: string
): string {
  return path.resolve(
    configDir,
    value.replace(/\$\{configDir\}/g, rootConfigDir)
  )
}

function resolveConfigFile(candidate: string): string | undefined {
  for (const configPath of [
    candidate,
    candidate.endsWith('.json') ? undefined : candidate + '.json',
  ]) {
    if (configPath && existsSync(configPath) && statSync(configPath).isFile()) {
      return configPath
    }
  }
}

function resolvePackageTsConfig(
  extendsPath: string,
  currentConfigDir: string
): string | undefined {
  const parts = extendsPath.split('/')
  const isPackageRoot = extendsPath.startsWith('@')
    ? parts.length === 2
    : parts.length === 1

  if (!isPackageRoot) {
    return undefined
  }

  try {
    const packageJsonPath = require.resolve(extendsPath + '/package.json', {
      paths: [currentConfigDir],
    })
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    if (packageJson.exports !== undefined) {
      try {
        const exportedConfig = require.resolve(extendsPath, {
          paths: [currentConfigDir],
        })
        if (path.extname(exportedConfig) === '.json') {
          return exportedConfig
        }
      } catch {}
    }
    if (typeof packageJson.tsconfig === 'string') {
      return resolveConfigFile(
        path.resolve(path.dirname(packageJsonPath), packageJson.tsconfig)
      )
    }
    return resolveConfigFile(
      path.join(path.dirname(packageJsonPath), 'tsconfig')
    )
  } catch {}
}

function resolveExtends(extendsPath: string, currentConfigDir: string): string {
  if (
    extendsPath.startsWith('./') ||
    extendsPath.startsWith('../') ||
    path.isAbsolute(extendsPath)
  ) {
    const resolved = path.resolve(currentConfigDir, extendsPath)
    if (existsSync(resolved)) {
      return resolved
    }
    if (!resolved.endsWith('.json') && existsSync(resolved + '.json')) {
      return resolved + '.json'
    }
    return resolved
  }

  const packageConfigPath = resolvePackageTsConfig(
    extendsPath,
    currentConfigDir
  )
  if (packageConfigPath) {
    return packageConfigPath
  }

  try {
    const resolved = require.resolve(extendsPath, { paths: [currentConfigDir] })
    if (path.extname(resolved) === '.json') {
      return resolved
    }
  } catch {}

  try {
    return require.resolve(extendsPath + '/tsconfig.json', {
      paths: [currentConfigDir],
    })
  } catch {
    return path.resolve(currentConfigDir, extendsPath)
  }
}

function loadTsConfigOptionsRecursive(
  configPath: string,
  visited: Set<string>,
  rootConfigDir: string
): RelevantCompilerOptions {
  const resolvedPath = path.resolve(configPath)

  if (visited.has(resolvedPath) || !existsSync(resolvedPath)) {
    return {}
  }

  const nextVisited = new Set(visited)
  nextVisited.add(resolvedPath)

  const configContent = readFileSync(resolvedPath, 'utf8')
  const config = CommentJson.parse(configContent)
  const configDir = path.dirname(resolvedPath)

  let mergedOptions: RelevantCompilerOptions = {}

  if (config.extends) {
    const extendsList = Array.isArray(config.extends)
      ? config.extends
      : [config.extends]

    for (const extendsPath of extendsList) {
      const parentConfigPath = resolveExtends(extendsPath, configDir)
      const parentOptions = loadTsConfigOptionsRecursive(
        parentConfigPath,
        nextVisited,
        rootConfigDir
      )
      mergedOptions = { ...mergedOptions, ...parentOptions }
    }
  }

  const currentOptions = config.compilerOptions ?? {}

  if (Object.hasOwn(currentOptions, 'paths')) {
    mergedOptions.paths = currentOptions.paths
    mergedOptions.pathsBasePath = configDir
  }

  if (
    Object.hasOwn(currentOptions, 'baseUrl') &&
    typeof currentOptions.baseUrl === 'string'
  ) {
    mergedOptions.baseUrl = resolveConfigDirValue(
      currentOptions.baseUrl,
      configDir,
      rootConfigDir
    )
  }

  if (mergedOptions.baseUrl) {
    mergedOptions.pathsBasePath = undefined
  }

  return mergedOptions
}

/**
 * Loads only the tsconfig options Next.js needs outside of the TypeScript API.
 * Paths and baseUrl keep the directory they were declared in while resolving
 * an extends chain, including arrays of extended configs.
 */
export function loadTsConfigOptions(
  configPath: string
): RelevantCompilerOptions {
  const resolvedPath = path.resolve(configPath)
  return loadTsConfigOptionsRecursive(
    resolvedPath,
    new Set(),
    path.dirname(resolvedPath)
  )
}
