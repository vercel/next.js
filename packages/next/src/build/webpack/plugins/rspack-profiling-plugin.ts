// A basic implementation to allow loaders access to loaderContext.currentTraceSpan

import type { Span } from '@opentelemetry/api'
import { createLocalSpan } from '../../../server/lib/trace/local-span-recorder'

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
          createLocalSpan({
            name: 'compilation-' + compilation.name,
            parent: this.runWebpackSpan,
          })
        )

        const compilationSpan = createLocalSpan({
          name: `compilation-${compilation.name}`,
          parent: this.runWebpackSpan,
        })

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
          const span = createLocalSpan({
            name: 'build-module',
            parent: compilationSpan,
            attributes: { name: module.userRequest, layer: module.layer },
          })

          moduleSpansByCompilation?.get(compilation)?.set(module, span)
        })

        compilation.hooks.succeedModule.tap(pluginName, (module: any) => {
          moduleSpansByCompilation?.get(compilation)?.get(module)?.end()
        })
      }
    )
  }
}
