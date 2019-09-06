import findUp from 'find-up'
import path from 'path'

type PluginMetaData = {
  name: string
  features: string[]
}

function collectPluginMeta(pluginPath: string): PluginMetaData {
  const pluginPackageJson = require(path.join(pluginPath, 'package.json'))
  const pluginMetaData = pluginPackageJson.nextjs
  if (!pluginMetaData) {
    throw new Error(
      'Next.js plugins need to have a "nextjs" key in package.json'
    )
  }

  return {
    name: '',
    features: [],
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

  return []
}
