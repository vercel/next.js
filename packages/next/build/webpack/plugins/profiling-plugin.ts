import { NormalModule } from 'next/dist/compiled/webpack/webpack'
import { Span } from '../../../trace'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

const pluginName = 'ProfilingPlugin'
export const spans = new WeakMap<webpack.Compilation | webpack.Compiler, Span>()
const moduleSpansByCompilation = new WeakMap<
  webpack.Compilation,
  WeakMap<webpack.Module, Span>
>()
export const webpackInvalidSpans = new WeakMap<any, Span>()

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
      onStart?: (span: Span, ...params: any[]) => void
      onStop?: () => void
    } = {}
  ) {
    let span: Span | undefined
    startHook.tap(
      { name: pluginName, stage: -Infinity },
      (...params: any[]) => {
        const name = typeof spanName === 'function' ? spanName() : spanName
        const attributes = attrs ? attrs(...params) : attrs
        span = parentSpan
          ? parentSpan().traceChild(name, attributes)
          : this.runWebpackSpan.traceChild(name, attributes)

        if (onStart) onStart(span, ...params)
      }
    )
    stopHook.tap({ name: pluginName, stage: Infinity }, () => {
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
      compiler.hooks.compilation,
      compiler.hooks.afterCompile,
      {
        parentSpan: () =>
          webpackInvalidSpans.get(compiler) || this.runWebpackSpan,
        attrs: () => ({ name: compiler.name }),
        onStart: (span, compilation) => {
          spans.set(compilation, span)
          spans.set(compiler, span)
          moduleSpansByCompilation.set(compilation, new WeakMap())
        },
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

    this.traceHookPair('make', compiler.hooks.make, compiler.hooks.finishMake, {
      parentSpan: () =>
        webpackInvalidSpans.get(compiler) || this.runWebpackSpan,
    })

    compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
      compilation.hooks.buildModule.tap(pluginName, (module: any) => {
        const compilationSpan = spans.get(compilation)
        if (!compilationSpan) {
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

        const moduleSpans = moduleSpansByCompilation.get(compilation)
        const spanName = `build-module${moduleType ? `-${moduleType}` : ''}`
        const issuerSpan: Span | undefined =
          issuerModule && moduleSpans?.get(issuerModule)
        if (issuerSpan) {
          span = issuerSpan.traceChild(spanName)
        } else {
          span = compilationSpan.traceChild(spanName)
        }
        span.setAttribute('name', module.userRequest)
        moduleSpans!.set(module, span)
      })

      const moduleHooks = NormalModule.getCompilationHooks(compilation)
      // @ts-ignore TODO: remove ignore when using webpack 5 types
      moduleHooks.readResource.for(undefined).intercept({
        register(tapInfo: any) {
          const fn = tapInfo.fn
          tapInfo.fn = (loaderContext: any, callback: any) => {
            const moduleSpan =
              loaderContext.currentTraceSpan.traceChild(`read-resource`)
            fn(loaderContext, (err: any, result: any) => {
              moduleSpan.stop()
              callback(err, result)
            })
          }
          return tapInfo
        },
      })

      moduleHooks.loader.tap(pluginName, (loaderContext: any, module: any) => {
        const moduleSpan = moduleSpansByCompilation
          .get(compilation)
          ?.get(module)
        loaderContext.currentTraceSpan = moduleSpan
      })

      compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
        moduleSpansByCompilation?.get(compilation)?.get(module)?.stop()
      })

      this.traceHookPair(
        'webpack-compilation-seal',
        compilation.hooks.seal,
        compilation.hooks.afterSeal,
        { parentSpan: () => spans.get(compilation)! }
      )

      compilation.hooks.addEntry.tap(pluginName, (entry: any) => {
        const compilationSpan = spans.get(compilation)
        if (!compilationSpan) {
          return
        }
        const addEntrySpan = compilationSpan.traceChild('add-entry')
        addEntrySpan.setAttribute('request', entry.request)
        spans.set(entry, addEntrySpan)
      })

      compilation.hooks.succeedEntry.tap(pluginName, (entry: any) => {
        spans.get(entry)?.stop()
      })

      this.traceHookPair(
        'webpack-compilation-chunk-graph',
        compilation.hooks.beforeChunks,
        compilation.hooks.afterChunks,
        { parentSpan: () => spans.get(compilation) || spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize',
        compilation.hooks.optimize,
        compilation.hooks.reviveModules,
        { parentSpan: () => spans.get(compilation) || spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-modules',
        compilation.hooks.optimizeModules,
        compilation.hooks.afterOptimizeModules,
        { parentSpan: () => spans.get(compilation) || spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-chunks',
        compilation.hooks.optimizeChunks,
        compilation.hooks.afterOptimizeChunks,
        { parentSpan: () => spans.get(compilation) || spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-optimize-tree',
        compilation.hooks.optimizeTree,
        compilation.hooks.afterOptimizeTree,
        { parentSpan: () => spans.get(compilation) || spans.get(compiler)! }
      )
      this.traceHookPair(
        'webpack-compilation-hash',
        compilation.hooks.beforeHash,
        compilation.hooks.afterHash,
        { parentSpan: () => spans.get(compilation) || spans.get(compiler)! }
      )
    })
  }
}
