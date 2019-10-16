import findUp from 'find-up'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import resolve from 'next/dist/compiled/resolve/index.js'

const readdir = promisify(fs.readdir)

export type PluginMetaData = {
  requiredEnv: string[]
  middleware: string[]
  pluginName: string
  directory: string
  pkgName: string
}

// currently supported middleware
export const VALID_MIDDLEWARE = [
  'init-client',
  'init-server',
  'on-error-server',
  'on-error-client',
  'document-head-tags',
  'document-body-tags',
  'document-html-props',
  'on-error-client',
  'on-error-server',
  'enhance-app-server',
  'get-styles-server',
]

type ENV_OPTIONS = { [name: string]: string }

const exitWithError = (error: string) => {
  console.error(error)
  process.exit(1)
}

async function collectPluginMeta(
  env: ENV_OPTIONS,
  pluginPackagePath: string
): Promise<PluginMetaData> {
  const pkgDir = path.dirname(pluginPackagePath)
  const pluginPackageJson = require(pluginPackagePath)
  const pluginMetaData: {
    name: string
    'required-env': string[]
  } = pluginPackageJson.nextjs

  if (!pluginMetaData) {
    exitWithError('Next.js plugins need to have a "nextjs" key in package.json')
  }

  if (!pluginMetaData.name) {
    exitWithError(
      'Next.js plugins need to have a "nextjs.name" key in package.json'
    )
  }

  // TODO: add err.sh explaining requirements
  let middleware: string[] = []
  try {
    middleware = await readdir(path.join(pkgDir, 'src'))
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(err)
    }
    exitWithError(
      `Failed to read src/ directory for Next.js plugin: ${pluginMetaData.name}`
    )
  }

  // remove the extension from the middleware
  middleware = middleware.map(item => {
    const parts = item.split('.')
    parts.pop()
    return parts.join('.')
  })

  const invalidMiddleware: string[] = []

  for (const item of middleware) {
    if (!VALID_MIDDLEWARE.includes(item)) {
      invalidMiddleware.push(item)
    }
  }

  if (invalidMiddleware.length > 0) {
    console.error(
      `Next.js Plugin: ${
        pluginMetaData.name
      } listed invalid middleware ${invalidMiddleware.join(', ')}`
    )
  }

  // TODO: investigate requiring plugins' env be prefixed
  // somehow to prevent collision
  if (!Array.isArray(pluginMetaData['required-env'])) {
    exitWithError(
      'Next.js plugins need to have a "nextjs.required-env" key in package.json'
    )
  }

  const missingEnvFields: string[] = []

  for (const field of pluginMetaData['required-env']) {
    if (typeof env[field] === 'undefined') {
      missingEnvFields.push(field)
    }
  }

  if (missingEnvFields.length > 0) {
    exitWithError(
      `Next.js Plugin: ${
        pluginMetaData.name
      } required env ${missingEnvFields.join(
        ', '
      )} but was missing in your \`next.config.js\``
    )
  }

  return {
    middleware,
    directory: pkgDir,
    requiredEnv: pluginMetaData['required-env'],
    pluginName: pluginMetaData.name,
    pkgName: pluginPackageJson.name,
  }
}

type SeparatedPlugins = {
  appMiddlewarePlugins: PluginMetaData[]
  documentMiddlewarePlugins: PluginMetaData[]
}

// clean package name so it can be used as variable
export const getPluginId = (pkg: string): string => {
  pkg = pkg.replace(/\W/g, '')

  if (pkg.match(/^[0-9]/)) {
    pkg = `_${pkg}`
  }
  return pkg
}

export function getSeparatedPlugins(
  plugins: PluginMetaData[]
): SeparatedPlugins {
  const appMiddlewarePlugins = []
  const documentMiddlewarePlugins = []

  for (const plugin of plugins) {
    let addedFor_app = false
    let addedFor_document = false

    // TODO: add checking if valid middleware export
    for (const middleware of plugin.middleware) {
      if (!addedFor_app && middleware.startsWith('_app.')) {
        appMiddlewarePlugins.push(plugin)
        addedFor_app = true
      }
      if (!addedFor_document && middleware.startsWith('_document.')) {
        documentMiddlewarePlugins.push(plugin)
        addedFor_document = true
      }
    }
  }

  return {
    appMiddlewarePlugins,
    documentMiddlewarePlugins,
  }
}

export async function collectPlugins(
  dir: string,
  env: ENV_OPTIONS
): Promise<PluginMetaData[]> {
  const rootPackageJsonPath = await findUp('package.json', { cwd: dir })
  if (!rootPackageJsonPath) {
    return []
  }
  const rootPackageJson = require(rootPackageJsonPath)

  let dependencies: string[] = []
  if (rootPackageJson.dependencies) {
    dependencies = dependencies.concat(
      Object.keys(rootPackageJson.dependencies)
    )
  }

  if (rootPackageJson.devDependencies) {
    dependencies = dependencies.concat(
      Object.keys(rootPackageJson.devDependencies)
    )
  }

  const nextPluginNames = dependencies.filter(name => {
    return name.startsWith('next-plugin-') || name.startsWith('@next/plugin-')
  })

  const nextPluginMetaData = await Promise.all(
    nextPluginNames.map(name =>
      collectPluginMeta(
        env,
        resolve.sync(path.join(name, 'package.json'), {
          basedir: dir,
          preserveSymlinks: true,
        })
      )
    )
  )

  return nextPluginMetaData
}
