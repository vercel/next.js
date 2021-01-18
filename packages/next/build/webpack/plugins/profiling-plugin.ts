import { tracer } from '../../tracer'
import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'

const pluginName = 'ProfilingPlugin'

export const spans = new WeakMap()

function getNormalModuleLoaderHook(compilation: any) {
  if (isWebpack5) {
    // @ts-ignore TODO: Remove ignore when webpack 5 is stable
    return webpack.NormalModule.getCompilationHooks(compilation).loader
  }

  return compilation.hooks.normalModuleLoader
}

export class ProfilingPlugin {
  apply(compiler: any) {
    // Only enabled when instrumentation is loaded
    const currentSpan = tracer.getCurrentSpan()
    console.log({
      currentSpan,
      isRecording: currentSpan?.isRecording(),
    })
    if (!currentSpan || !currentSpan.isRecording()) {
      return
    }

    compiler.hooks.compile.tap(pluginName, () => {
      const span = tracer.startSpan('webpack-compile', {
        attributes: { name: compiler.name },
      })
      spans.set(compiler, span)
    })
    compiler.hooks.done.tap(pluginName, () => {
      spans.get(compiler).end()
    })
    compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
      compilation.hooks.buildModule.tap(pluginName, (module: any) => {
        tracer.withSpan(spans.get(compiler), () => {
          const span = tracer.startSpan('build-module')
          span.setAttribute('name', module.userRequest)
          spans.set(module, span)
        })
      })

      getNormalModuleLoaderHook(compilation).tap(
        pluginName,
        (loaderContext: any, module: any) => {
          const parentSpan = spans.get(module)
          loaderContext.currentTraceSpan = parentSpan
        }
      )

      compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
        spans.get(module).end()
      })
    })
  }
}
