import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import { Span } from '../../../trace'

const pluginName = 'ProfilingPlugin'
export const spans = new WeakMap<any, Span>()
export const webpackInvalidSpans = new WeakMap<any, Span>()

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
    spanName: string | (() => string),
    startHook: any,
    stopHook: any,
    {
      parentSpan,
      attrs,
      onStart,
      onStop,
    }: {
      parentSpan?: () => Span
      attrs?: any
      onStart?: (span: Span) => void
      onStop?: () => void
    } = {}
  ) {
    let span: Span | undefined
    startHook.tap(pluginName, (...params: any[]) => {
      const name = typeof spanName === 'function' ? spanName() : spanName
      const attributes = attrs ? attrs(...params) : attrs
      span = parentSpan
        ? parentSpan().traceChild(name, attributes)
        : this.runWebpackSpan.traceChild(name, attributes)

      if (onStart) onStart(span)
    })
    stopHook.tap(pluginName, () => {
      // `stopHook` may be triggered when `startHook` has not in cases
      // where `stopHook` is used as the terminating event for more
      // than one pair of hooks.
      if (!span) {
        return
      }

      if (onStop) onStop()
      span.stop()
    })
  }

  traceTopLevelHooks(compiler: any) {
    this.traceHookPair(
      'webpack-compilation',
      isWebpack5 ? compiler.hooks.beforeCompile : compiler.hooks.compile,
      isWebpack5 ? compiler.hooks.afterCompile : compiler.hooks.done,
      {
        parentSpan: () =>
          webpackInvalidSpans.get(compiler) || this.runWebpackSpan,
        attrs: () => ({ name: compiler.name }),
        onStart: (span) => spans.set(compiler, span),
      }
    )

    if (compiler.options.mode === 'development') {
      this.traceHookPair(
        () => `webpack-invalidated-${compiler.name}`,
        compiler.hooks.invalid,
        compiler.hooks.done,
        {
          onStart: (span) => webpackInvalidSpans.set(compiler, span),
          onStop: () => webpackInvalidSpans.delete(compiler),
          attrs: (fileName: any) => ({
            trigger: fileName || 'manual',
          }),
        }
      )
    }
  }

  traceCompilationHooks(compiler: any) {
    this.traceHookPair('emit', compiler.hooks.emit, compiler.hooks.afterEmit, {
      parentSpan: () =>
        webpackInvalidSpans.get(compiler) || this.runWebpackSpan,
    })

    if (isWebpack5) {
      this.traceHookPair(
        'make',
        compiler.hooks.make,
        compiler.hooks.finishMake,
        {
          parentSpan: () =>
            webpackInvalidSpans.get(compiler) || this.runWebpackSpan,
        }
      )
    }

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

      if (isWebpack5) {
        this.traceHookPair(
          'webpack-compilation-seal',
          compilation.hooks.seal,
          compilation.hooks.afterSeal,
          { parentSpan: () => spans.get(compiler)! }
        )

        this.traceHookPair(
          'add-entry',
          compilation.hooks.addEntry,
          compilation.hooks.afterSeal,
          {
            attrs: (entry: any) => {
              return {
                request: entry.request,
              }
            },
            parentSpan: () => spans.get(compiler)!,
          }
        )
      }

      this.traceHookPair(
        'webpack-compilation-chunk-graph',
        compilation.hooks.beforeChunks,
        compilation.hooks.afterChunks,
        { parentSpan: () => spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize',
        compilation.hooks.optimize,
        compilation.hooks.reviveModules,
        { parentSpan: () => spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-modules',
        compilation.hooks.optimizeModules,
        compilation.hooks.afterOptimizeModules,
        { parentSpan: () => spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-chunks',
        compilation.hooks.optimizeChunks,
        compilation.hooks.afterOptimizeChunks,
        { parentSpan: () => spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-tree',
        compilation.hooks.optimizeTree,
        compilation.hooks.afterOptimizeTree,
        { parentSpan: () => spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-hash',
        compilation.hooks.beforeHash,
        compilation.hooks.afterHash,
        { parentSpan: () => spans.get(compiler)! }
      )
    })
  }
}
