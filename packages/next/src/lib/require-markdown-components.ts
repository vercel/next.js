import type { MarkdownComponents } from '@next/markdown'

import { existsSync, readFileSync, statSync } from 'node:fs'
import Module from 'node:module'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'

type MarkdownComponentsModule = {
  default?: {
    useMarkdownComponents?: () => MarkdownComponents
  }
  useMarkdownComponents?: () => MarkdownComponents
}

const MARKDOWN_COMPONENTS_CANDIDATES = [
  join('src', 'markdown-components.tsx'),
  join('src', 'markdown-components.ts'),
  join('src', 'markdown-components.jsx'),
  join('src', 'markdown-components.js'),
  'markdown-components.tsx',
  'markdown-components.ts',
  'markdown-components.jsx',
  'markdown-components.js',
]

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

const userModuleCache = new Map<string, unknown>()

function getMarkdownComponentsPath(cwd: string): string | null {
  for (const candidate of MARKDOWN_COMPONENTS_CANDIDATES) {
    const filePath = join(cwd, candidate)
    if (existsSync(filePath)) {
      return filePath
    }
  }

  return null
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function resolveUserModulePath(
  fromFilename: string,
  request: string
): string | null {
  if (!request.startsWith('.') && !isAbsolute(request)) {
    return null
  }

  const basePath = request.startsWith('.')
    ? resolve(dirname(fromFilename), request)
    : request

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

function executeUserModule(filePath: string): unknown {
  const cached = userModuleCache.get(filePath)
  if (cached) {
    return cached
  }

  const source = readFileSync(filePath, 'utf8')
  const transformed = transformModule(source, filePath)
  const moduleRecord = { exports: {} as unknown }
  userModuleCache.set(filePath, moduleRecord.exports)

  const createRequire = Module.createRequire(filePath)
  const localRequire = (request: string) => {
    const resolvedUserModulePath = resolveUserModulePath(filePath, request)
    if (resolvedUserModulePath) {
      return executeUserModule(resolvedUserModulePath)
    }

    return createRequire(request)
  }

  // eslint-disable-next-line no-new-func -- We compile user-provided markdown-components modules to CommonJS and execute them in an isolated local module scope.
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
  userModuleCache.set(filePath, moduleRecord.exports)
  return moduleRecord.exports
}

function loadMarkdownComponentsModule(
  filePath: string
): MarkdownComponentsModule {
  return executeUserModule(filePath) as MarkdownComponentsModule
}

export function requireMarkdownComponents(): MarkdownComponents {
  const filePath = getMarkdownComponentsPath(process.cwd())
  if (!filePath) {
    return {}
  }

  const mod = loadMarkdownComponentsModule(filePath)
  const loadMarkdownComponents =
    mod.useMarkdownComponents ?? mod.default?.useMarkdownComponents

  if (typeof loadMarkdownComponents !== 'function') {
    return {}
  }

  return loadMarkdownComponents()
}
