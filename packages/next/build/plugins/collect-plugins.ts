import findUp from 'find-up'
import path from 'path'
import resolve from 'next/dist/compiled/resolve/index.js'

export type PluginMetaData = {
  middleware: string[]
  pluginName: string
  directory: string
  pkgName: string
}

function collectPluginMeta(pluginPackagePath: string): PluginMetaData {
  const pluginPackageJson = require(pluginPackagePath)
  const pluginMetaData: {
    name: string
    middleware: string[]
  } = pluginPackageJson.nextjs

  if (!pluginMetaData) {
    throw new Error(
      'Next.js plugins need to have a "nextjs" key in package.json'
    )
  }

  if (!pluginMetaData.name) {
    throw new Error(
      'Next.js plugins need to have a "nextjs.name" key in package.json'
    )
  }

  // TODO: add err.sh explaining requirements
  if (!Array.isArray(pluginMetaData.middleware)) {
    throw new Error(
      'Next.js plugins need to have a "nextjs.middleware" key in package.json'
    )
  }

  return {
    directory: path.dirname(pluginPackagePath),
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

export async function collectPlugins(dir: string): Promise<PluginMetaData[]> {
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
        resolve.sync(path.join(name, 'package.json'), {
          basedir: dir,
          preserveSymlinks: true,
        })
      )
    )
  )

  return nextPluginMetaData
}
