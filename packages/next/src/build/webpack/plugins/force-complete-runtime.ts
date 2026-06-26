import { webpack } from 'next/dist/compiled/webpack/webpack'

export default class ForceCompleteRuntimePlugin {
  allSharedRuntimeGlobals = new Set([
    // List is incomplete. These are the globals that are not commonly in the
    // Webpack runtime but may show up during after Client navs.
    // If you ever get "__webpack_require__.X is not a function" or similar,
    // check https://github.com/webpack/webpack/blob/0f84d1e3bf69915dc060f23ced9dfa468a884a42/lib/RuntimeGlobals.js
    // for which one it is and add it here.
    webpack.RuntimeGlobals.compatGetDefaultExport,
  ])

  apply(compiler: webpack.Compiler) {
    compiler.hooks.thisCompilation.tap(
      'ForceCompleteRuntimePlugin',
      (compilation) => {
        // Ensure that each chunk uses the complete Webpack runtime.
        // That way soft nav to a new page has the full runtime available
        // by the time the chunk loads.
        // This is a workaround until we can get Webpack to include runtime updates
        // in the Flight response or the Flight Client to wait for HMR updates.
        compilation.hooks.afterChunks.tap(
          { name: 'ForceCompleteRuntimePlugin' },
          (chunks) => {
            for (const chunk of chunks) {
              compilation.chunkGraph.addChunkRuntimeRequirements(
                chunk,
                this.allSharedRuntimeGlobals
              )
              // Just need to add runtime requirements to one chunk since we only
              // have one runtime chunk for all other chunks.
              break
            }
          }
        )
      }
    )
  }
}
