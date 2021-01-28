import { tracer } from '../../tracer'
import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import { Span } from '@opentelemetry/api'

const pluginName = 'ProfilingPlugin'
const forceTrace = false

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
    if (!currentSpan || (!currentSpan.isRecording() && !forceTrace)) {
      return
    }

    this.traceTopLevelHooks(compiler)
    this.traceCompilationHooks(compiler)
  }

  traceTopLevelHooks(compiler: any) {
    compiler.hooks.compile.tap(pluginName, () => {
      const span = tracer.startSpan('webpack-compile', {
        attributes: { name: compiler.name },
      })
      spans.set(compiler, span)
    })
    compiler.hooks.done.tap(pluginName, () => {
      spans.get(compiler).end()
    })

    compiler.hooks.watchRun.tap(pluginName, () => {
      const span = tracer.startSpan('webpack-watchrun')
      spans.set(compiler, span)
    })
    compiler.hooks.watchClose.tap(pluginName, () => {
      spans.get(compiler)?.end()
    })

    compiler.hooks.environment.tap(pluginName, () => {
      const span = tracer.startSpan('webpack-prepare-env')
      spans.set(compiler, span)
    })
    compiler.hooks.afterEnvironment.tap(pluginName, () => {
      spans.get(compiler)?.end()
    })
  }

  traceHookPair(spanName: string, startHook: any, stopHook: any) {
    const reportedSpanName = `webpack-compilation-${spanName}`
    let span: Span | null = null
    startHook.tap(pluginName, () => (span = tracer.startSpan(reportedSpanName)))
    stopHook.tap(pluginName, () => span?.end())
  }

  traceLoopedHook(spanName: string, startHook: any, stopHook: any) {
    const reportedSpanName = `webpack-compilation-${spanName}`
    let span: Span | null = null
    startHook.tap(pluginName, () => {
      if (span) {
        span = tracer.startSpan(reportedSpanName)
      }
    })
    stopHook.tap(pluginName, () => span?.end())
  }

  traceCompilationHooks(compiler: any) {
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

      this.traceHookPair(
        'chunk-graph',
        compilation.hooks.beforeChunks,
        compilation.hooks.afterChunks
      )
      this.traceHookPair(
        'optimize',
        compilation.hooks.optimize,
        compilation.hooks.reviveModules
      )
      this.traceLoopedHook(
        'optimize-modules',
        compilation.hooks.optimizeModules,
        compilation.hooks.afterOptimizeModules
      )
      this.traceLoopedHook(
        'optimize-chunks',
        compilation.hooks.optimizeChunks,
        compilation.hooks.afterOptimizeChunks
      )
      this.traceHookPair(
        'optimize-tree',
        compilation.hooks.optimizeTree,
        compilation.hooks.afterOptimizeTree
      )
      this.traceHookPair(
        'hash',
        compilation.hooks.beforeHash,
        compilation.hooks.afterHash
      )
    })
  }
}
