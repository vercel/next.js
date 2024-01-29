import { NormalModule } from 'next/dist/compiled/webpack/webpack'
import type { Span } from '../../../trace'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'

const pluginName = 'ProfilingPlugin'
export const spans = new WeakMap<webpack.Compilation | webpack.Compiler, Span>()
const moduleSpansByCompilation = new WeakMap<
  webpack.Compilation,
  WeakMap<webpack.Module, Span>
>()
const makeSpanByCompilation = new WeakMap<webpack.Compilation, Span>()
const sealSpanByCompilation = new WeakMap<webpack.Compilation, Span>()
export const webpackInvalidSpans = new WeakMap<any, Span>()

const TRACE_LABELS_SEAL = [
  'module assets',
  'create chunk assets',
  'asset render',
  'asset emit',
  'store asset',
]

function inTraceLabelsSeal(label: string) {
  return TRACE_LABELS_SEAL.some((l) => label.startsWith(l))
}

export class ProfilingPlugin {
  compiler: any
  runWebpackSpan: Span
  rootDir: string

  constructor({
    runWebpackSpan,
    rootDir,
  }: {
    runWebpackSpan: Span
    rootDir: string
  }) {
    this.runWebpackSpan = runWebpackSpan
    this.rootDir = rootDir
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
      parentSpan?: (...params: any[]) => Span
      attrs?: any
      onStart?: (span: Span, ...params: any[]) => void
      onStop?: (span: Span, ...params: any[]) => void
    } = {}
  ) {
    let span: Span | undefined
    startHook.tap(
      { name: pluginName, stage: -Infinity },
      (...params: any[]) => {
        const name = typeof spanName === 'function' ? spanName() : spanName
        const attributes = attrs ? attrs(...params) : attrs
        span = parentSpan
          ? parentSpan(...params).traceChild(name, attributes)
          : this.runWebpackSpan.traceChild(name, attributes)

        if (onStart) onStart(span, ...params)
      }
    )
    stopHook.tap({ name: pluginName, stage: Infinity }, (...params: any[]) => {
      // `stopHook` may be triggered when `startHook` has not in cases
      // where `stopHook` is used as the terminating event for more
      // than one pair of hooks.
      if (!span) {
        return
      }

      if (onStop) onStop(span, ...params)
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
            trigger: fileName
              ? path.relative(this.rootDir, fileName).replaceAll(path.sep, '/')
              : 'manual',
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
      parentSpan: (compilation) => {
        const compilationSpan = spans.get(compilation)
        if (!compilationSpan) {
          return webpackInvalidSpans.get(compiler) || this.runWebpackSpan
        }

        return compilationSpan
      },
      onStart: (span, compilation) => {
        makeSpanByCompilation.set(compilation, span)
      },
      onStop: (_span, compilation) => {
        makeSpanByCompilation.delete(compilation)
      },
    })

    compiler.hooks.compilation.tap(
      { name: pluginName, stage: -Infinity },
      (compilation: any) => {
        compilation.hooks.buildModule.tap(pluginName, (module: any) => {
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
            let parentSpan: Span | undefined
            for (const incomingConnection of compilation.moduleGraph.getIncomingConnections(
              module
            )) {
              const entrySpan = spans.get(incomingConnection.dependency)
              if (entrySpan) {
                parentSpan = entrySpan
                break
              }
            }

            if (!parentSpan) {
              const compilationSpan = spans.get(compilation)
              if (!compilationSpan) {
                return
              }

              parentSpan = compilationSpan
            }
            span = parentSpan.traceChild(spanName)
          }
          span.setAttribute('name', module.userRequest)
          span.setAttribute('layer', module.layer)
          moduleSpans!.set(module, span)
        })

        const moduleHooks = NormalModule.getCompilationHooks(compilation)
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

        moduleHooks.loader.tap(
          pluginName,
          (loaderContext: any, module: any) => {
            const moduleSpan = moduleSpansByCompilation
              .get(compilation)
              ?.get(module)
            loaderContext.currentTraceSpan = moduleSpan
          }
        )

        compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
          moduleSpansByCompilation?.get(compilation)?.get(module)?.stop()
        })
        compilation.hooks.failedModule.tap(pluginName, (module: any) => {
          moduleSpansByCompilation?.get(compilation)?.get(module)?.stop()
        })

        this.traceHookPair(
          'seal',
          compilation.hooks.seal,
          compilation.hooks.afterSeal,
          {
            parentSpan: () => spans.get(compilation)!,
            onStart(span) {
              sealSpanByCompilation.set(compilation, span)
            },
            onStop() {
              sealSpanByCompilation.delete(compilation)
            },
          }
        )

        compilation.hooks.addEntry.tap(pluginName, (entry: any) => {
          const parentSpan =
            makeSpanByCompilation.get(compilation) || spans.get(compilation)
          if (!parentSpan) {
            return
          }
          const addEntrySpan = parentSpan.traceChild('add-entry')
          addEntrySpan.setAttribute('request', entry.request)
          spans.set(entry, addEntrySpan)
        })

        compilation.hooks.succeedEntry.tap(pluginName, (entry: any) => {
          spans.get(entry)?.stop()
          spans.delete(entry)
        })
        compilation.hooks.failedEntry.tap(pluginName, (entry: any) => {
          spans.get(entry)?.stop()
          spans.delete(entry)
        })

        this.traceHookPair(
          'chunk-graph',
          compilation.hooks.beforeChunks,
          compilation.hooks.afterChunks,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'optimize',
          compilation.hooks.optimize,
          compilation.hooks.reviveModules,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'optimize-modules',
          compilation.hooks.optimizeModules,
          compilation.hooks.afterOptimizeModules,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'optimize-chunks',
          compilation.hooks.optimizeChunks,
          compilation.hooks.afterOptimizeChunks,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'optimize-tree',
          compilation.hooks.optimizeTree,
          compilation.hooks.afterOptimizeTree,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'optimize-chunk-modules',
          compilation.hooks.optimizeChunkModules,
          compilation.hooks.afterOptimizeChunkModules,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'module-hash',
          compilation.hooks.beforeModuleHash,
          compilation.hooks.afterModuleHash,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'code-generation',
          compilation.hooks.beforeCodeGeneration,
          compilation.hooks.afterCodeGeneration,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'hash',
          compilation.hooks.beforeHash,
          compilation.hooks.afterHash,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )
        this.traceHookPair(
          'code-generation-jobs',
          compilation.hooks.afterHash,
          compilation.hooks.beforeModuleAssets,
          {
            parentSpan: () =>
              sealSpanByCompilation.get(compilation) || spans.get(compilation)!,
          }
        )

        const logs = new Map()
        const originalTime = compilation.logger.time
        const originalTimeEnd = compilation.logger.timeEnd

        compilation.logger.time = (label: string) => {
          if (!inTraceLabelsSeal(label)) {
            return originalTime.call(compilation.logger, label)
          }
          const span = sealSpanByCompilation.get(compilation)
          if (span) {
            logs.set(label, span.traceChild(label.replace(/ /g, '-')))
          }
          return originalTime.call(compilation.logger, label)
        }
        compilation.logger.timeEnd = (label: string) => {
          if (!inTraceLabelsSeal(label)) {
            return originalTimeEnd.call(compilation.logger, label)
          }

          const span = logs.get(label)
          if (span) {
            span.stop()
            logs.delete(label)
          }
          return originalTimeEnd.call(compilation.logger, label)
        }
      }
    )
  }
}
