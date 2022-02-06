import type { LoaderDefinition } from 'webpack'
import RefreshModuleRuntime from './internal/ReactRefreshModule.runtime'

let refreshModuleRuntime = RefreshModuleRuntime.toString()
refreshModuleRuntime = refreshModuleRuntime.slice(
  refreshModuleRuntime.indexOf('{') + 1,
  refreshModuleRuntime.lastIndexOf('}')
)

const ReactRefreshLoader: LoaderDefinition = function ReactRefreshLoader(
  source,
  inputSourceMap
) {
  this.callback(null, `${source}\n\n;${refreshModuleRuntime}`, inputSourceMap)
}

export default ReactRefreshLoader
