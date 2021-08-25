import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import { trace, Span } from '../../../telemetry/trace'

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
  runWebpackSpan: Span

  constructor({ runWebpackSpan }: { runWebpackSpan: Span }) {
    this.runWebpackSpan = runWebpackSpan
  }
  apply(compiler: any) {
    this.traceTopLevelHooks(compiler)
    this.traceCompilationHooks(compiler)
    this.compiler = compiler
  }

  traceHookPair(
    spanName: string,
    startHook: any,
    stopHook: any,
    {
      parentSpan,
      attrs,
      onSetSpan,
    }: {
      parentSpan?: () => Span
      attrs?: any
      onSetSpan?: (span: Span) => void
    } = {}
  ) {
    let span: Span | undefined
    startHook.tap(pluginName, () => {
      span = parentSpan
        ? parentSpan().traceChild(spanName, attrs ? attrs() : attrs)
        : trace(spanName, undefined, attrs ? attrs() : attrs)

      onSetSpan?.(span)
    })
    stopHook.tap(pluginName, () => {
      // `stopHook` may be triggered when `startHook` has not in cases
      // where `stopHook` is used as the terminating event for more
      // than one pair of hooks.
      if (!span) {
        return
      }
      span.stop()
    })
  }

  traceTopLevelHooks(compiler: any) {
    this.traceHookPair(
      'webpack-compilation',
      isWebpack5 ? compiler.hooks.beforeCompile : compiler.hooks.compile,
      isWebpack5 ? compiler.hooks.afterCompile : compiler.hooks.done,
      {
        parentSpan: () => this.runWebpackSpan,
        attrs: () => ({ name: compiler.name }),
        onSetSpan: (span) => spans.set(compiler, span),
      }
    )

    if (compiler.options.mode === 'development') {
      this.traceHookPair(
        'webpack-invalidated',
        compiler.hooks.invalid,
        compiler.hooks.done,
        { attrs: () => ({ name: compiler.name }) }
      )
    }
  }

  traceCompilationHooks(compiler: any) {
    this.traceHookPair(
      'webpack-emit',
      compiler.hooks.emit,
      compiler.hooks.afterEmit,
      { parentSpan: () => this.runWebpackSpan }
    )

    compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
      compilation.hooks.buildModule.tap(pluginName, (module: any) => {
        const compilerSpan = spans.get(compiler)
        if (!compilerSpan) {
          return
        }

        const moduleType = (() => {
          if (!module.userRequest) {
            return ''
          }

          return module.userRequest.split('.').pop()
        })()

        const issuerModule = compilation?.moduleGraph?.getIssuer(module)

        let span: Span

        const spanName = `build-module${moduleType ? `-${moduleType}` : ''}`
        const issuerSpan: Span | undefined =
          issuerModule && spans.get(issuerModule)
        if (issuerSpan) {
          span = issuerSpan.traceChild(spanName)
        } else {
          span = compilerSpan.traceChild(spanName)
        }
        span.setAttribute('name', module.userRequest)
        spans.set(module, span)
      })

      getNormalModuleLoaderHook(compilation).tap(
        pluginName,
        (loaderContext: any, module: any) => {
          const moduleSpan = spans.get(module)
          loaderContext.currentTraceSpan = moduleSpan
        }
      )

      compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
        spans.get(module)?.stop()
      })

      this.traceHookPair(
        'webpack-compilation-chunk-graph',
        compilation.hooks.beforeChunks,
        compilation.hooks.afterChunks,
        { parentSpan: () => this.runWebpackSpan }
      )
      this.traceHookPair(
        'webpack-compilation-optimize',
        compilation.hooks.optimize,
        compilation.hooks.reviveModules,
        { parentSpan: () => this.runWebpackSpan }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-modules',
        compilation.hooks.optimizeModules,
        compilation.hooks.afterOptimizeModules,
        { parentSpan: () => this.runWebpackSpan }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-chunks',
        compilation.hooks.optimizeChunks,
        compilation.hooks.afterOptimizeChunks,
        { parentSpan: () => this.runWebpackSpan }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-tree',
        compilation.hooks.optimizeTree,
        compilation.hooks.afterOptimizeTree,
        { parentSpan: () => this.runWebpackSpan }
      )
      this.traceHookPair(
        'webpack-compilation-hash',
        compilation.hooks.beforeHash,
        compilation.hooks.afterHash,
        { parentSpan: () => this.runWebpackSpan }
      )
    })
  }
}
