// A basic implementation to allow loaders access to loaderContext.currentTraceSpan

import type { Span } from '../../../trace'

import { getRspackCore } from '../../../shared/lib/get-rspack'

const pluginName = 'RspackProfilingPlugin'
const moduleSpansByCompilation = new WeakMap()
export const compilationSpans: WeakMap<any, Span> = new WeakMap()

export class RspackProfilingPlugin {
  runWebpackSpan: Span

  constructor({ runWebpackSpan }: { runWebpackSpan: Span }) {
    this.runWebpackSpan = runWebpackSpan
  }

  apply(compiler: any) {
    compiler.hooks.thisCompilation.tap(
      { name: pluginName, stage: -Infinity },
      (compilation: any) => {
        const rspack = getRspackCore()

        moduleSpansByCompilation.set(compilation, new WeakMap())
        compilationSpans.set(
          compilation,
          this.runWebpackSpan.traceChild('compilation-' + compilation.name)
        )

        const compilationSpan = this.runWebpackSpan.traceChild(
          `compilation-${compilation.name}`
        )

        const moduleHooks = rspack.NormalModule.getCompilationHooks(compilation)
        moduleHooks.loader.tap(
          pluginName,
          (loaderContext: any, module: any) => {
            const moduleSpan = moduleSpansByCompilation
              .get(compilation)
              ?.get(module)
            loaderContext.currentTraceSpan = moduleSpan
          }
        )

        compilation.hooks.buildModule.tap(pluginName, (module: any) => {
          const span = compilationSpan.traceChild('build-module')
          span.setAttribute('name', module.userRequest)
          span.setAttribute('layer', module.layer)

          moduleSpansByCompilation?.get(compilation)?.set(module, span)
        })

        compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
          moduleSpansByCompilation?.get(compilation)?.get(module)?.stop()
        })
      }
    )
  }
}
