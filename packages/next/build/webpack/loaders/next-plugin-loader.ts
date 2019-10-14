import { loader } from 'webpack'
import { parse } from 'querystring'
import { PluginMetaData, getPluginId } from '../../plugins/collect-plugins'

export type NextPluginLoaderQuery = {
  middleware: string
}

export const pluginLoaderOptions: {
  plugins: PluginMetaData[]
} = {
  plugins: [],
}

const nextPluginLoader: loader.Loader = function(source) {
  const { middleware }: NextPluginLoaderQuery =
    typeof this.query === 'string' ? parse(this.query.substr(1)) : this.query

  const plugins = pluginLoaderOptions.plugins.filter(plugin => {
    return plugin.middleware.includes(middleware)
  })

  const pluginIds: string[] = []

  return `
    ${plugins
      .map(plugin => {
        const pluginId = getPluginId(plugin.pkgName)
        pluginIds.push(pluginId)
        return `import ${pluginId} from '${
          plugin.directory
        }/middleware/${middleware}'`
      })
      .join('\n')}

    export default function (ctx) {
      return Promise.all([${pluginIds.map(id => `${id}(ctx)`).join(',')}])
    }
  `
}

export default nextPluginLoader
