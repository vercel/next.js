const path = require('path')

module.exports = async function () {
  // Import a TypeScript module that has its own dependencies (cjs-dep.ts -> metadata.json, esm-dep.mjs)
  const configPath = path.resolve(__dirname, 'config-data.ts')
  const configModule = await this.importModule(configPath)
  const config = configModule.default || configModule

  // Import an ESM .mjs module that itself imports esm-dep.mjs and uses new URL() + WebAssembly
  const mjsPath = path.resolve(__dirname, 'config-data.mjs')
  const mjsModule = await this.importModule(mjsPath)
  const mjsConfig = mjsModule.default || mjsModule

  const title = config.title
  const items = config.items.join(', ')
  const cjsGreeting = config.cjsGreeting
  const version = config.version
  const esmLabel = config.esmLabel
  const urlPathname = config.urlPathname
  const wasmAvailable = String(config.wasmAvailable)

  const mjsTitle = mjsConfig.mjsTitle
  const mjsEsmLabel = mjsConfig.esmLabel
  const mjsUrlPathname = mjsConfig.mjsUrlPathname
  const mjsWasmAvailable = String(mjsConfig.mjsWasmAvailable)

  return `
    export const title = ${JSON.stringify(title)};
    export const items = ${JSON.stringify(items)};
    export const cjsGreeting = ${JSON.stringify(cjsGreeting)};
    export const version = ${JSON.stringify(version)};
    export const esmLabel = ${JSON.stringify(esmLabel)};
    export const urlPathname = ${JSON.stringify(urlPathname)};
    export const wasmAvailable = ${JSON.stringify(wasmAvailable)};
    export const mjsTitle = ${JSON.stringify(mjsTitle)};
    export const mjsEsmLabel = ${JSON.stringify(mjsEsmLabel)};
    export const mjsUrlPathname = ${JSON.stringify(mjsUrlPathname)};
    export const mjsWasmAvailable = ${JSON.stringify(mjsWasmAvailable)};
  `
}
