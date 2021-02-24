import { tracer, stackPush, stackPop } from '../../tracer'
import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import {
  Span,
  trace,
  ProxyTracerProvider,
  NoopTracerProvider,
} from '@opentelemetry/api'

const pluginName = 'ProfilingPlugin'
export const spans = new WeakMap()

function getNormalModuleLoaderHook(compilation: any) {
  if (isWebpack5) {
    // @ts-ignore TODO: Remove ignore when webpack 5 is stable
    return webpack.NormalModule.getCompilationHooks(compilation).loader
  }

  return compilation.hooks.normalModuleLoader
}

function tracingIsEnabled() {
  const tracerProvider: any = trace.getTracerProvider()
  if (tracerProvider instanceof ProxyTracerProvider) {
    const proxyDelegate: any = tracerProvider.getDelegate()
    return !(proxyDelegate instanceof NoopTracerProvider)
  }
  return false
}

export class ProfilingPlugin {
  compiler: any

  apply(compiler: any) {
    // Only enable plugin when instrumentation is loaded
    if (!tracingIsEnabled()) {
      return
    }
    this.traceTopLevelHooks(compiler)
    this.traceCompilationHooks(compiler)
    this.compiler = compiler
  }

  traceHookPair(
    spanName: string,
    startHook: any,
    stopHook: any,
    attrs?: any,
    onSetSpan?: (span: Span | undefined) => void
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
      stackPop(this.compiler, span, spanName)
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
      stackPop(this.compiler, span, spanName)
    })
  }

  traceTopLevelHooks(compiler: any) {
    this.traceHookPair(
      'webpack-compile',
      compiler.hooks.compile,
      compiler.hooks.done,
      () => {
        return { attributes: { name: compiler.name } }
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
        compiler.hooks.done
      )
    }
  }

  traceCompilationHooks(compiler: any) {
    if (isWebpack5) {
      this.traceHookPair(
        'webpack-compilation',
        compiler.hooks.beforeCompile,
        compiler.hooks.afterCompile
      )
    }

    compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
      compilation.hooks.buildModule.tap(pluginName, (module: any) => {
        const compilerSpan = spans.get(compiler)
        if (!compilerSpan) {
          return
        }
        tracer.withSpan(compilerSpan, () => {
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
