import { NormalModule } from 'next/dist/compiled/webpack/webpack'
import { Worker as JestWorker } from 'next/dist/compiled/jest-worker'

const acornWorker = new JestWorker(require.resolve('./parallel-acorn-loader'), {
  // numWorkers: 1,
  enableWorkerThreads: true,
  // maxRetries: 0,
}) as JestWorker & {
  parseModuleWebpackAST: typeof import('./acorn-parser-worker').parseModuleWebpackAST
}

const pluginName = 'ParallelAcornPlugin'

export function parallelAcornPlugin(compiler: any) {
  compiler.hooks.compilation.tap(pluginName, (compilation: any) => {
    // return
    const moduleHooks = NormalModule.getCompilationHooks(compilation)

    moduleHooks.beforeParse.tapPromise(
      pluginName,
      async (webpackModule: any) => {
        // TODO: Figure out what modules don't work with this parser enabled.
        if (
          webpackModule.resource.includes('test/e2e/app-dir/app') ||
          webpackModule.resource.includes('next/dist')
        ) {
          const sourceType = webpackModule.parser.sourceType

          webpackModule._ast = await acornWorker.parseModuleWebpackAST(
            sourceType,
            webpackModule._source.source()
          )
          // Add empty comments so that webpack doesn't throw an error
          webpackModule._ast.comments = []
        }
      }
    )
  })
}
