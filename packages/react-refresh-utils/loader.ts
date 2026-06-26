import type { LoaderDefinition } from 'webpack'
import RefreshModuleRuntime from './internal/ReactRefreshModule.runtime'

let refreshModuleRuntime = RefreshModuleRuntime.toString()
refreshModuleRuntime = refreshModuleRuntime
  .slice(
    refreshModuleRuntime.indexOf('{') + 1,
    refreshModuleRuntime.lastIndexOf('}')
  )
  // Given that the import above executes the module we need to make sure it does not crash on `import.meta` not being allowed.
  .replace('global.importMeta', 'import.meta')

let commonJsrefreshModuleRuntime = refreshModuleRuntime.replace(
  'import.meta.webpackHot',
  'module.hot'
)

const ReactRefreshLoader: LoaderDefinition = function ReactRefreshLoader(
  source,
  inputSourceMap
) {
  this.callback(
    null,
    `${source}\n\n;${
      // Account for commonjs not supporting `import.meta
      this.resourcePath.endsWith('.cjs')
        ? commonJsrefreshModuleRuntime
        : refreshModuleRuntime
    }`,
    inputSourceMap
  )
}

export default ReactRefreshLoader
