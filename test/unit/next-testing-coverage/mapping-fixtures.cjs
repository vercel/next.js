const fs = require('node:fs')
const path = require('node:path')

/** Keep authored coverage models shared while reading independent compiler profiles. */
function readMappingFixture(file, reviver) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'), reviver)
  const modelsFile = path.join(
    path.dirname(path.dirname(file)),
    path.basename(file, '.json') + '.models.json'
  )
  if (fs.existsSync(modelsFile)) {
    const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'), reviver)
    for (const field of ['model', 'observed']) {
      if (Object.hasOwn(models, field))
        value[field] = { ...models[field], ...value[field] }
    }
  }
  return value
}

module.exports = { readMappingFixture }
