import { tracer } from '../../tracer'
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
  if (Object.getPrototypeOf(tracerProvider) === ProxyTracerProvider) {
    const proxyDelegate: any = tracerProvider.getDelegate()
    return Object.getPrototypeOf(proxyDelegate) !== NoopTracerProvider
  }
  return false
}

export class ProfilingPlugin {
  // Map should be defined on ProfilingPlugin instance to avoid collisions
  // when multiple compilers are running concurrently.
  spans: Map<string, Span> | undefined

  apply(compiler: any) {
    // Only enable plugin when instrumentation is loaded
    if (!tracingIsEnabled()) {
      return
    }
    this.spans = new Map()
    this.traceTopLevelHooks(compiler)
    this.traceCompilationHooks(compiler)
  }

  traceWithParent(parentName: string, spanName: string, attrs?: any) {
    if (!this.spans) {
      return
    }
    const parentSpan = this.spans.get(parentName)
    if (!parentSpan) {
      return tracer.startSpan(spanName, attrs)
    }

    let span: Span | undefined
    tracer.withSpan(parentSpan, () => {
      span = tracer.startSpan(spanName, attrs)
      this.spans?.set?.(spanName, span)
    })
    return span
  }

  traceHookPair(
    spanName: string,
    parentName: string | null,
    startHook: any,
    stopHook: any,
    attrs?: any,
    onSetSpan?: (span: Span | undefined) => void
  ) {
    let span: Span | undefined
    startHook.tap(pluginName, () => {
      span = parentName
        ? this.traceWithParent(parentName, spanName, attrs)
        : tracer.startSpan(spanName, attrs)
      onSetSpan?.(span)
    })
    stopHook.tap(pluginName, () => span?.end?.())
  }

  traceLoopedHook(
    spanName: string,
    parentName: string,
    startHook: any,
    stopHook: any
  ) {
    let span: Span | null = null
    startHook.tap(pluginName, () => {
      if (!span) {
        this.traceWithParent(parentName, spanName)
      }
    })
    stopHook.tap(pluginName, () => span?.end?.())
  }

  traceHook(
    spanName: string,
    parentName: string,
    hook: any,
    onSet?: (span: Span | undefined) => void
  ) {
    let span: Span | undefined
    hook.intercept({
      tap: () => {
        span = this.traceWithParent(parentName, spanName)
        onSet?.(span)
      },
      done: () => {
        span?.end?.()
      },
    })
  }

  traceTopLevelHooks(compiler: any) {
    this.traceHookPair(
      'webpack-compile',
      null,
      compiler.hooks.compile,
      compiler.hooks.done,
      { attributes: { name: compiler.name } },
      (span) => spans.set(compiler, span)
    )
    this.traceHookPair(
      'webpack-watch-run',
      'webpack-compile',
      compiler.hooks.watchRun,
      compiler.hooks.watchClose
    )

    this.traceHookPair(
      'webpack-prepare-env',
      'webpack-compile',
      compiler.hooks.environment,
      compiler.hooks.afterEnvironment
    )
  }

  traceCompilationHooks(compiler: any) {
    this.traceHook('compilation', 'webpack-compile', compiler.hooks.compilation)

    compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
      compilation.hooks.buildModule.tap(pluginName, (module: any) => {
        const compilerSpan = this.spans?.get(compiler)
        if (!compilerSpan) {
          return
        }
        tracer.withSpan(compilerSpan, () => {
          const span = tracer.startSpan('build-module')
          span.setAttribute('name', module.userRequest)
          this.spans?.set?.(module, span)
        })
      })

      getNormalModuleLoaderHook(compilation).tap(
        pluginName,
        (loaderContext: any, module: any) => {
          const parentSpan = this.spans?.get?.(module)
          loaderContext.currentTraceSpan = parentSpan
        }
      )

      compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
        this.spans?.get?.(module)?.end()
      })

      this.traceHookPair(
        'webpack-compilation-chunk-graph',
        'compilation',
        compilation.hooks.beforeChunks,
        compilation.hooks.afterChunks
      )
      this.traceHookPair(
        'webpack-compilation-optimize',
        'compilation',
        compilation.hooks.optimize,
        compilation.hooks.reviveModules
      )
      this.traceLoopedHook(
        'webpack-compilation-optimize-modules',
        'compilation',
        compilation.hooks.optimizeModules,
        compilation.hooks.afterOptimizeModules
      )
      this.traceLoopedHook(
        'webpack-compilation-optimize-chunks',
        'compilation',
        compilation.hooks.optimizeChunks,
        compilation.hooks.afterOptimizeChunks
      )
      this.traceHookPair(
        'webpack-compilation-optimize-tree',
        'compilation',
        compilation.hooks.optimizeTree,
        compilation.hooks.afterOptimizeTree
      )
      this.traceHookPair(
        'webpack-compilation-hash',
        'compilation',
        compilation.hooks.beforeHash,
        compilation.hooks.afterHash
      )
    })
  }
}
