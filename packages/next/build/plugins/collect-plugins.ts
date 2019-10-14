import findUp from 'find-up'
import path from 'path'
import resolve from 'next/dist/compiled/resolve/index.js'

export type PluginMetaData = {
  middlewareVersion: number
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

function collectPluginMeta(
  env: ENV_OPTIONS,
  pluginPackagePath: string
): PluginMetaData {
  const pluginPackageJson = require(pluginPackagePath)
  const pluginMetaData: {
    name: string
    version: number
    middleware: string[]
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
  if (!Array.isArray(pluginMetaData.middleware)) {
    exitWithError(
      'Next.js plugins need to have a "nextjs.middleware" key in package.json'
    )
  }

  const invalidMiddleware: string[] = []

  for (const middleware of pluginMetaData.middleware) {
    if (!VALID_MIDDLEWARE.includes(middleware)) {
      invalidMiddleware.push(middleware)
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
    directory: path.dirname(pluginPackagePath),
    requiredEnv: pluginMetaData['required-env'],
    middlewareVersion: pluginMetaData.version,
    middleware: pluginMetaData.middleware,
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
