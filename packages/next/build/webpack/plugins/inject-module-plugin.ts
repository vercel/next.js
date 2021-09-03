import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'

const pluginName = 'InjectModulePlugin'

export interface InjectModulePluginContext {
  module: any
}

function getNormalModuleLoaderHook(compilation: any) {
  if (isWebpack5) {
    // @ts-ignore TODO: Remove ignore when webpack 5 is stable
    return webpack.NormalModule.getCompilationHooks(compilation).loader
  }

  return compilation.hooks.normalModuleLoader
}

export class InjectModulePlugin {
  apply(compiler: any) {
    compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
      getNormalModuleLoaderHook(compilation).tap(
        pluginName,
        (loader: any, module: any) => {
          loader._injectModulePlugin = {
            module: module,
          }
        }
      )
    })
  }
}
