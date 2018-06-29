export default class ChunkNamesPlugin {
  apply (compiler) {
    compiler.hooks.compilation.tap('NextJsChunkNamesPlugin', (compilation) => {
      compilation.chunkTemplate.hooks.renderManifest.intercept({
        register (tapInfo) {
          if (tapInfo.name === 'JavascriptModulesPlugin') {
            const originalMethod = tapInfo.fn
            tapInfo.fn = (result, options) => {
              let filenameTemplate
              const chunk = options.chunk
              const outputOptions = options.outputOptions
              if (chunk.filenameTemplate) {
                filenameTemplate = chunk.filenameTemplate
              } else if (chunk.hasEntryModule()) {
                filenameTemplate = outputOptions.filename
              } else {
                filenameTemplate = outputOptions.chunkFilename
              }

              options.chunk.filenameTemplate = filenameTemplate
              return originalMethod(result, options)
            }
          }
          return tapInfo
        }
      })
    })
  }
}
