const path = require('path')

module.exports = async function () {
  // Import a TypeScript module that has its own dependencies
  // (cjs-dep.ts -> metadata.json, esm-dep.mjs)
  const configPath = path.resolve(__dirname, 'config-data.ts')
  const configModule = await this.importModule(configPath)
  const config = configModule.default || configModule

  // Import an ESM .mjs module that also imports esm-dep.mjs
  const mjsPath = path.resolve(__dirname, 'config-data.mjs')
  const mjsModule = await this.importModule(mjsPath)
  const mjsConfig = mjsModule.default || mjsModule

  const title = config.title
  const items = config.items.join(', ')
  const cjsGreeting = config.cjsGreeting
  const version = config.version
  const esmLabel = config.esmLabel

  const mjsTitle = mjsConfig.mjsTitle
  const mjsEsmLabel = mjsConfig.esmLabel

  // Try importing the wasm+URL module (supported in Turbopack,
  // not in webpack's importModule)
  let imageUrl = 'unsupported'
  let wasmAddResult = 'unsupported'
  let mjsImageUrl = 'unsupported'
  let mjsWasmAddResult = 'unsupported'
  try {
    const urlWasmPath = path.resolve(__dirname, 'url-wasm-data.ts')
    const urlWasmModule = await this.importModule(urlWasmPath)
    const urlWasm = urlWasmModule.default || urlWasmModule
    imageUrl = urlWasm.imageUrl
    wasmAddResult = String(urlWasm.wasmAddResult)

    const mjsUrlWasmPath = path.resolve(__dirname, 'url-wasm-data.mjs')
    const mjsUrlWasmModule = await this.importModule(mjsUrlWasmPath)
    const mjsUrlWasm = mjsUrlWasmModule.default || mjsUrlWasmModule
    mjsImageUrl = mjsUrlWasm.mjsImageUrl
    mjsWasmAddResult = String(mjsUrlWasm.mjsWasmAddResult)
  } catch {
    // webpack's importModule doesn't support wasm/URL asset patterns
  }

  return `
    export const title = ${JSON.stringify(title)};
    export const items = ${JSON.stringify(items)};
    export const cjsGreeting = ${JSON.stringify(cjsGreeting)};
    export const version = ${JSON.stringify(version)};
    export const esmLabel = ${JSON.stringify(esmLabel)};
    export const imageUrl = ${JSON.stringify(imageUrl)};
    export const wasmAddResult = ${JSON.stringify(wasmAddResult)};
    export const mjsTitle = ${JSON.stringify(mjsTitle)};
    export const mjsEsmLabel = ${JSON.stringify(mjsEsmLabel)};
    export const mjsImageUrl = ${JSON.stringify(mjsImageUrl)};
    export const mjsWasmAddResult = ${JSON.stringify(mjsWasmAddResult)};
  `
}
