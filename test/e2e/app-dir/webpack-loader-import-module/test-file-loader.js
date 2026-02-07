const path = require('path')

module.exports = async function () {
  // Import a CJS module that has its own dependencies (cjs-dep -> metadata.json)
  const configPath = path.resolve(__dirname, 'config-data.js')
  const configModule = await this.importModule(configPath)
  const config = configModule.default || configModule

  // Import an ESM module
  const esmPath = path.resolve(__dirname, 'esm-dep.mjs')
  const esmModule = await this.importModule(esmPath)
  const esmLabel = esmModule.label || esmModule.default?.label

  const title = config.title
  const items = config.items.join(', ')
  const cjsGreeting = config.cjsGreeting
  const version = config.version

  return `
    export const title = ${JSON.stringify(title)};
    export const items = ${JSON.stringify(items)};
    export const cjsGreeting = ${JSON.stringify(cjsGreeting)};
    export const version = ${JSON.stringify(version)};
    export const esmLabel = ${JSON.stringify(esmLabel)};
  `
}
