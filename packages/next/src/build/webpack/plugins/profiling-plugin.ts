import { NormalModule } from 'next/dist/compiled/webpack/webpack'
import type { Span } from '@opentelemetry/api'
import {
  createLocalSpan,
  type LocalRecordingSpan,
} from '../../../server/lib/trace/local-span-recorder'
import { getTracer } from '../../../server/lib/trace/tracer'
import { ToolingSpan } from '../../../server/lib/trace/constants'
import { normalizeToolingAttributes } from '../../../trace/trace'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'

const pluginName = 'ProfilingPlugin'
export const spans = new WeakMap<webpack.Compilation | webpack.Compiler, Span>()
const moduleSpansByCompilation = new WeakMap<
  webpack.Compilation,
  WeakMap<webpack.Module, LocalRecordingSpan>
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
        span = createLocalSpan({
          name,
          parent: parentSpan ? parentSpan(...params) : this.runWebpackSpan,
          attributes,
        })

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
      span.end()
    })
  }

  traceTopLevelHooks(compiler: any) {
    let compilationSpan: Span | undefined
    compiler.hooks.compilation.tap(
      { name: pluginName, stage: -Infinity },
      (compilation: webpack.Compilation) => {
        compilationSpan = getTracer().startSpan(
          ToolingSpan.webpackCompilation,
          {
            parent: webpackInvalidSpans.get(compiler) || this.runWebpackSpan,
            attributes: normalizeToolingAttributes({ name: compiler.name }),
          }
        )
        spans.set(compilation, compilationSpan)
        spans.set(compiler, compilationSpan)
        moduleSpansByCompilation.set(compilation, new WeakMap())
      }
    )
    compiler.hooks.afterCompile.tap({ name: pluginName, stage: Infinity }, () =>
      compilationSpan?.end()
    )

    if (compiler.options.mode === 'development') {
      let invalidationSpan: Span | undefined
      compiler.hooks.invalid.tap(
        { name: pluginName, stage: -Infinity },
        (fileName: string | null) => {
          invalidationSpan = getTracer().startSpan(
            ToolingSpan.webpackInvalidated,
            {
              spanName: `webpack-invalidated-${compiler.name}`,
              parent: this.runWebpackSpan,
              attributes: {
                trigger: fileName
                  ? path
                      .relative(this.rootDir, fileName)
                      .replaceAll(path.sep, '/')
                  : 'manual',
              },
            }
          )
          webpackInvalidSpans.set(compiler, invalidationSpan)
        }
      )
      compiler.hooks.done.tap({ name: pluginName, stage: Infinity }, () => {
        if (invalidationSpan) {
          webpackInvalidSpans.delete(compiler)
          invalidationSpan.end()
        }
      })
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
            const r = module.userRequest
            if (!r || r.endsWith('!')) {
              return ''
            } else {
              const resource = r.split('!').pop()
              const match = /^[^?]+\.([^?]+)$/.exec(resource)
              return match ? match[1] : ''
            }
          })()

          const issuerModule = compilation?.moduleGraph?.getIssuer(module)

          let span: LocalRecordingSpan

          const moduleSpans = moduleSpansByCompilation.get(compilation)
          const spanName = `build-module${moduleType ? `-${moduleType}` : ''}`
          const issuerSpan: Span | undefined =
            issuerModule && moduleSpans?.get(issuerModule)
          if (issuerSpan) {
            span = createLocalSpan({
              name: spanName,
              parent: issuerSpan,
            })
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
            span = createLocalSpan({ name: spanName, parent: parentSpan })
          }
          span.setAttributes(
            normalizeToolingAttributes({
              name: module.userRequest,
              layer: module.layer,
            })
          )
          moduleSpans!.set(module, span)
        })

        const moduleHooks = NormalModule.getCompilationHooks(compilation)
        moduleHooks.readResource.for(undefined).intercept({
          register(tapInfo: any) {
            const fn = tapInfo.fn
            tapInfo.fn = (loaderContext: any, callback: any) => {
              fn(loaderContext, (err: any, result: any) => {
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
          moduleSpansByCompilation?.get(compilation)?.get(module)?.end()
        })
        compilation.hooks.failedModule.tap(pluginName, (module: any) => {
          moduleSpansByCompilation?.get(compilation)?.get(module)?.end()
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
          const addEntrySpan = createLocalSpan({
            name: 'add-entry',
            parent: parentSpan,
            attributes: { request: entry.request },
          })
          spans.set(entry, addEntrySpan)
        })

        compilation.hooks.succeedEntry.tap(pluginName, (entry: any) => {
          spans.get(entry)?.end()
          spans.delete(entry)
        })
        compilation.hooks.failedEntry.tap(pluginName, (entry: any) => {
          spans.get(entry)?.end()
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
            logs.set(
              label,
              createLocalSpan({
                name: label.replace(/ /g, '-'),
                parent: span,
              })
            )
          }
          return originalTime.call(compilation.logger, label)
        }
        compilation.logger.timeEnd = (label: string) => {
          if (!inTraceLabelsSeal(label)) {
            return originalTimeEnd.call(compilation.logger, label)
          }

          const span = logs.get(label)
          if (span) {
            span.end()
            logs.delete(label)
          }
          return originalTimeEnd.call(compilation.logger, label)
        }
      }
    )
  }
}
