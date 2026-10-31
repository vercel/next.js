const path = require('path')

module.exports = async function () {
  // Import a TypeScript module that has its own dependencies
  // (cjs-dep.ts -> metadata.json, esm-dep.mjs)
  const configPath = path.resolve(__dirname, 'config-data.ts')
  const configModule = await this.importModule(configPath)
  const config = configModule.default || configModule

  // Import an ESM .mjs module that also imports esm-dep.mjs
  // Uses a relative path (resolved relative to the transformed module, app/file.test-file.ts)
  const mjsModule = await this.importModule('../config-data.mjs')
  const mjsConfig = mjsModule.default || mjsModule

  const title = config.title
  const items = config.items.join(', ')
  const cjsGreeting = config.cjsGreeting
  const version = config.version
  const esmLabel = config.esmLabel

  const mjsTitle = mjsConfig.mjsTitle
  const mjsEsmLabel = mjsConfig.esmLabel

  // --- resolveAlias tests ---
  let aliasValue = 'unsupported'
  let aliasDepLabel = 'unsupported'
  try {
    // importModule with alias as the request
    const aliasModule = await this.importModule('alias-data')
    const aliasData = aliasModule.default || aliasModule
    aliasValue = aliasData.aliasValue

    // importModule on a module whose dependency uses an alias
    // Uses a relative path (resolved relative to the transformed module)
    const aliasConfigModule = await this.importModule('../alias-config.mjs')
    const aliasConfig = aliasConfigModule.default || aliasConfigModule
    aliasDepLabel = aliasConfig.depLabel
  } catch (e) {
    // resolveAlias may not be supported in all contexts
    console.error('resolveAlias importModule failed:', e)
  }

  // --- loader rules tests ---
  let customDataValue = 'unsupported'
  let consumedValue = 'unsupported'
  try {
    // importModule on a file that requires a custom loader rule
    const customDataPath = path.resolve(__dirname, 'values.custom-data')
    const customDataModule = await this.importModule(customDataPath)
    customDataValue = customDataModule.default || customDataModule

    // importModule on a module whose dependency needs a custom loader rule
    // Uses a relative path (resolved relative to the transformed module)
    const dataConsumerModule = await this.importModule('../data-consumer.mjs')
    const dataConsumer = dataConsumerModule.default || dataConsumerModule
    consumedValue = dataConsumer.consumedValue
  } catch (e) {
    // loader rules may not be supported in importModule in all contexts
    console.error('loader rules importModule failed:', e)
  }

  // Try importing the wasm+URL+dynamic-import module (supported in
  // Turbopack, not in webpack's importModule)
  let imageUrl = 'unsupported'
  let wasmAddResult = 'unsupported'
  let dynamicValue = 'unsupported'
  let mjsImageUrl = 'unsupported'
  let mjsWasmAddResult = 'unsupported'
  let mjsDynamicValue = 'unsupported'
  try {
    const urlWasmPath = path.resolve(__dirname, 'url-wasm-data.ts')
    const urlWasmModule = await this.importModule(urlWasmPath)
    const urlWasm = urlWasmModule.default || urlWasmModule
    imageUrl = urlWasm.imageUrl
    wasmAddResult = String(urlWasm.wasmAddResult)
    dynamicValue = urlWasm.dynamicValue

    const mjsUrlWasmModule = await this.importModule('../url-wasm-data.mjs')
    const mjsUrlWasm = mjsUrlWasmModule.default || mjsUrlWasmModule
    mjsImageUrl = mjsUrlWasm.mjsImageUrl
    mjsWasmAddResult = String(mjsUrlWasm.mjsWasmAddResult)
    mjsDynamicValue = mjsUrlWasm.mjsDynamicValue
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
    export const dynamicValue = ${JSON.stringify(dynamicValue)};
    export const mjsTitle = ${JSON.stringify(mjsTitle)};
    export const mjsEsmLabel = ${JSON.stringify(mjsEsmLabel)};
    export const mjsImageUrl = ${JSON.stringify(mjsImageUrl)};
    export const mjsWasmAddResult = ${JSON.stringify(mjsWasmAddResult)};
    export const mjsDynamicValue = ${JSON.stringify(mjsDynamicValue)};
    export const aliasValue = ${JSON.stringify(aliasValue)};
    export const aliasDepLabel = ${JSON.stringify(aliasDepLabel)};
    export const customDataValue = ${JSON.stringify(customDataValue)};
    export const consumedValue = ${JSON.stringify(consumedValue)};
  `
}
