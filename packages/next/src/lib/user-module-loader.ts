import { readFileSync, statSync } from 'node:fs'
import Module from 'node:module'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'

import type { ResolvedBaseUrl } from '../build/load-jsconfig'
import {
  isString,
  matchPatternOrExact,
  matchedText,
  pathIsRelative,
  patternText,
} from './jsconfig-path-matcher'

const USER_MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]

type UserModuleLoaderOptions = {
  dir: string
  tsconfigPath?: string
  dev?: boolean
}

type UserModuleCacheEntry = {
  exports: unknown
  dependencies: ReadonlySet<string>
}

type UserModuleResolutionConfig = {
  paths: Record<string, string[]>
  resolvedBaseUrl: ResolvedBaseUrl
}

const userModuleCache = new Map<string, UserModuleCacheEntry>()
const userModuleResolutionCache = new Map<string, UserModuleResolutionConfig>()

export async function loadUserModule(
  filePath: string,
  options: UserModuleLoaderOptions
): Promise<unknown> {
  const resolutionConfig = await getUserModuleResolutionConfig(options)
  return executeUserModule(filePath, options, resolutionConfig).exports
}

function executeUserModule(
  filePath: string,
  options: UserModuleLoaderOptions,
  resolutionConfig: UserModuleResolutionConfig
): UserModuleCacheEntry {
  if (!options.dev) {
    const cached = userModuleCache.get(filePath)
    if (cached) {
      return cached
    }
  }

  const source = readFileSync(filePath, 'utf8')
  const transformed = transformModule(source, filePath)
  const moduleRecord = { exports: {} as unknown }
  const dependencies = new Set<string>([filePath])

  const createRequire = Module.createRequire(filePath)
  const localRequire = (request: string) => {
    const resolvedUserModulePath = resolveUserModuleRequest(
      filePath,
      request,
      resolutionConfig
    )

    if (resolvedUserModulePath) {
      const dependencyEntry = executeUserModule(
        resolvedUserModulePath,
        options,
        resolutionConfig
      )
      dependencyEntry.dependencies.forEach((dependency) => {
        dependencies.add(dependency)
      })
      return dependencyEntry.exports
    }

    return createRequire(request)
  }

  // eslint-disable-next-line no-new-func -- We compile user-provided modules to CommonJS and execute them in an isolated local module scope.
  const wrapped = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    transformed
  ) as (
    exports: unknown,
    require: (request: string) => unknown,
    module: { exports: unknown },
    __filename: string,
    __dirname: string
  ) => void

  wrapped(
    moduleRecord.exports,
    localRequire,
    moduleRecord,
    filePath,
    dirname(filePath)
  )

  const entry: UserModuleCacheEntry = {
    exports: moduleRecord.exports,
    dependencies,
  }

  if (!options.dev) {
    userModuleCache.set(filePath, entry)
  }

  return entry
}

async function getUserModuleResolutionConfig(
  options: UserModuleLoaderOptions
): Promise<UserModuleResolutionConfig> {
  const cacheKey = `${options.dir}:${options.tsconfigPath || ''}`
  if (!options.dev) {
    const cached = userModuleResolutionCache.get(cacheKey)
    if (cached) {
      return cached
    }
  }

  const config = loadRuntimeJsConfig(options.dir, options.tsconfigPath)

  if (!options.dev) {
    userModuleResolutionCache.set(cacheKey, config)
  }

  return config
}

function loadRuntimeJsConfig(
  dir: string,
  tsconfigPath?: string
): UserModuleResolutionConfig {
  const tsConfigFileName = tsconfigPath || 'tsconfig.json'
  const resolvedTsConfigPath = join(dir, tsConfigFileName)
  const resolvedJsConfigPath = join(dir, 'jsconfig.json')

  let implicitBaseurl: string | undefined
  let compilerOptions: Record<string, unknown> | undefined

  if (isFile(resolvedTsConfigPath)) {
    compilerOptions = parseJsonConfigFile(resolvedTsConfigPath).compilerOptions
    implicitBaseurl = dirname(resolvedTsConfigPath)
  } else if (isFile(resolvedJsConfigPath)) {
    compilerOptions = parseJsonConfigFile(resolvedJsConfigPath).compilerOptions
    implicitBaseurl = dirname(resolvedJsConfigPath)
  }

  let resolvedBaseUrl: ResolvedBaseUrl
  if (typeof compilerOptions?.baseUrl === 'string') {
    resolvedBaseUrl = {
      baseUrl: resolve(dir, compilerOptions.baseUrl),
      isImplicit: false,
    }
  } else if (implicitBaseurl) {
    resolvedBaseUrl = {
      baseUrl: implicitBaseurl,
      isImplicit: true,
    }
  }

  return {
    paths:
      (compilerOptions?.paths as Record<string, string[]>) ??
      Object.create(null),
    resolvedBaseUrl,
  }
}

function parseJsonConfigFile(filePath: string): {
  compilerOptions?: Record<string, unknown>
} {
  const JSON5 =
    require('next/dist/compiled/json5') as typeof import('next/dist/compiled/json5')

  const contents = readFileSync(filePath, 'utf8')
  if (contents.trim() === '') {
    return {}
  }

  return JSON5.parse(contents) as { compilerOptions?: Record<string, unknown> }
}

function resolveUserModuleRequest(
  fromFilename: string,
  request: string,
  resolutionConfig: UserModuleResolutionConfig
): string | null {
  if (request.startsWith('.')) {
    return resolveAbsoluteUserModulePath(
      resolve(dirname(fromFilename), request)
    )
  }

  if (isAbsolute(request)) {
    return resolveAbsoluteUserModulePath(request)
  }

  const aliasResolvedPath = resolveJsConfigModulePath(request, resolutionConfig)
  if (aliasResolvedPath) {
    return aliasResolvedPath
  }

  return null
}

function resolveJsConfigModulePath(
  request: string,
  resolutionConfig: UserModuleResolutionConfig
): string | null {
  const { paths, resolvedBaseUrl } = resolutionConfig

  if (!resolvedBaseUrl || pathIsRelative(request) || isAbsolute(request)) {
    return null
  }

  const pathKeys = Object.keys(paths)
  if (pathKeys.length > 0) {
    const matchedPattern = matchPatternOrExact(pathKeys, request)
    if (matchedPattern) {
      const matchedStar = isString(matchedPattern)
        ? undefined
        : matchedText(matchedPattern, request)
      const matchedPatternText = isString(matchedPattern)
        ? matchedPattern
        : patternText(matchedPattern)

      for (const substitution of paths[matchedPatternText] || []) {
        const candidatePath = matchedStar
          ? substitution.replace('*', matchedStar)
          : substitution

        if (candidatePath.endsWith('.d.ts')) {
          continue
        }

        const resolvedPath = resolveAbsoluteUserModulePath(
          resolve(resolvedBaseUrl.baseUrl, candidatePath)
        )
        if (resolvedPath) {
          return resolvedPath
        }
      }
    }
  }

  if (resolvedBaseUrl.isImplicit) {
    return null
  }

  return resolveAbsoluteUserModulePath(
    resolve(resolvedBaseUrl.baseUrl, request)
  )
}

function resolveAbsoluteUserModulePath(basePath: string): string | null {
  if (isFile(basePath)) {
    return basePath
  }

  for (const extension of USER_MODULE_EXTENSIONS) {
    if (isFile(basePath + extension)) {
      return basePath + extension
    }
  }

  for (const extension of USER_MODULE_EXTENSIONS) {
    const indexPath = join(basePath, `index${extension}`)
    if (isFile(indexPath)) {
      return indexPath
    }
  }

  return null
}

function shouldEnableJsxTransform(filename: string): boolean {
  const extension = extname(filename)
  return extension === '.jsx' || extension === '.tsx'
}

function shouldUseTypeScriptParser(filename: string): boolean {
  const extension = extname(filename)
  return (
    extension === '.ts' ||
    extension === '.tsx' ||
    extension === '.cts' ||
    extension === '.mts'
  )
}

function transformModule(code: string, filename: string): string {
  // eslint-disable-next-line no-eval -- We need runtime `require` here so the Node-only SWC loader isn't statically bundled into edge-facing codepaths.
  const dynamicRequire = eval('require') as NodeJS.Require
  const { transformSync } = dynamicRequire(
    'next/dist/build/swc'
  ) as typeof import('../build/swc')

  const parser = shouldUseTypeScriptParser(filename)
    ? {
        syntax: 'typescript' as const,
        tsx: shouldEnableJsxTransform(filename),
      }
    : {
        syntax: 'ecmascript' as const,
        jsx: shouldEnableJsxTransform(filename),
      }

  return transformSync(code, {
    filename,
    jsc: {
      parser,
      transform: shouldEnableJsxTransform(filename)
        ? {
            react: {
              runtime: 'automatic',
            },
          }
        : undefined,
    },
    module: {
      type: 'commonjs',
    },
    isModule: 'unknown',
    env: {
      targets: {
        node: process.versions.node ?? '20.19.0',
      },
    },
  }).code
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
