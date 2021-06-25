import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import { trace, stackPush, stackPop, Span } from '../../../telemetry/trace'

const pluginName = 'ProfilingPlugin'
export const spans = new WeakMap<any, Span>()

function getNormalModuleLoaderHook(compilation: any) {
  if (isWebpack5) {
    // @ts-ignore TODO: Remove ignore when webpack 5 is stable
    return webpack.NormalModule.getCompilationHooks(compilation).loader
  }

  return compilation.hooks.normalModuleLoader
}

export class ProfilingPlugin {
  compiler: any

  apply(compiler: any) {
    this.traceTopLevelHooks(compiler)
    this.traceCompilationHooks(compiler)
    this.compiler = compiler
  }

  traceHookPair(
    spanName: string,
    startHook: any,
    stopHook: any,
    attrs?: any,
    onSetSpan?: (span: Span) => void
  ) {
    let span: Span | undefined
    startHook.tap(pluginName, () => {
      span = stackPush(this.compiler, spanName, attrs)
      onSetSpan?.(span)
    })
    stopHook.tap(pluginName, () => {
      // `stopHook` may be triggered when `startHook` has not in cases
      // where `stopHook` is used as the terminating event for more
      // than one pair of hooks.
      if (!span) {
        return
      }
      stackPop(this.compiler, span)
    })
  }

  traceLoopedHook(spanName: string, startHook: any, stopHook: any) {
    let span: Span | undefined
    startHook.tap(pluginName, () => {
      if (!span) {
        span = stackPush(this.compiler, spanName)
      }
    })
    stopHook.tap(pluginName, () => {
      stackPop(this.compiler, span)
    })
  }

  traceTopLevelHooks(compiler: any) {
    this.traceHookPair(
      'webpack-compile',
      compiler.hooks.compile,
      compiler.hooks.done,
      () => {
        return { name: compiler.name }
      },
      (span) => spans.set(compiler, span)
    )
    this.traceHookPair(
      'webpack-prepare-env',
      compiler.hooks.environment,
      compiler.hooks.afterEnvironment
    )
    if (compiler.options.mode === 'development') {
      this.traceHookPair(
        'webpack-invalidated',
        compiler.hooks.invalid,
        compiler.hooks.done,
        () => ({ name: compiler.name })
      )
    }
  }

  traceCompilationHooks(compiler: any) {
    if (isWebpack5) {
      this.traceHookPair(
        'webpack-compilation',
        compiler.hooks.beforeCompile,
        compiler.hooks.afterCompile,
        () => ({ name: compiler.name })
      )
    }

    compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
      compilation.hooks.buildModule.tap(pluginName, (module: any) => {
        const compilerSpan = spans.get(compiler)
        if (!compilerSpan) {
          return
        }

        const span = trace('build-module', compilerSpan.id)
        span.setAttribute('name', module.userRequest)
        spans.set(module, span)
      })

      getNormalModuleLoaderHook(compilation).tap(
        pluginName,
        (loaderContext: any, module: any) => {
          const parentSpan = spans.get(module)
          loaderContext.currentTraceSpan = parentSpan
        }
      )

      compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
        spans.get(module)?.stop()
      })

      this.traceHookPair(
        'webpack-compilation-chunk-graph',
        compilation.hooks.beforeChunks,
        compilation.hooks.afterChunks
      )
      this.traceHookPair(
        'webpack-compilation-optimize',
        compilation.hooks.optimize,
        compilation.hooks.reviveModules
      )
      this.traceLoopedHook(
        'webpack-compilation-optimize-modules',
        compilation.hooks.optimizeModules,
        compilation.hooks.afterOptimizeModules
      )
      this.traceLoopedHook(
        'webpack-compilation-optimize-chunks',
        compilation.hooks.optimizeChunks,
        compilation.hooks.afterOptimizeChunks
      )
      this.traceHookPair(
        'webpack-compilation-optimize-tree',
        compilation.hooks.optimizeTree,
        compilation.hooks.afterOptimizeTree
      )
      this.traceHookPair(
        'webpack-compilation-hash',
        compilation.hooks.beforeHash,
        compilation.hooks.afterHash
      )
    })
  }
}
