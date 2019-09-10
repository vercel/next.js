import findUp from 'find-up'
import path from 'path'
import resolve from 'next/dist/compiled/resolve/index.js'

type PluginMetaData = {
  directory: string
  name: string
}

function collectPluginMeta(pluginPackagePath: string): PluginMetaData {
  const pluginPackageJson = require(pluginPackagePath)
  const pluginMetaData: PluginMetaData = pluginPackageJson.nextjs
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

  return {
    directory: path.dirname(pluginPackagePath),
    name: pluginMetaData.name,
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

  console.log(nextPluginMetaData)

  return []
}
