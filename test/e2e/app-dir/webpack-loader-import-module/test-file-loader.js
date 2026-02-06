const path = require('path')

module.exports = async function () {
  const configPath = path.resolve(__dirname, 'config-data.js')
  const configModule = await this.importModule(configPath)
  const config = configModule.default || configModule

  const title = config.title
  const items = config.items.join(', ')

  return `
    export const title = ${JSON.stringify(title)};
    export const items = ${JSON.stringify(items)};
  `
}
