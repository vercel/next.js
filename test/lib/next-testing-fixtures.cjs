const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath, pathToFileURL, URL } = require('node:url')
const aliases = require('./next-testing-fixture-aliases.json')

const repositoryRoot = path.resolve(__dirname, '../..')
const aliasFiles = Object.keys(aliases)

function fixtureKey(file) {
  let filename
  if (typeof file === 'string') filename = file
  else if (Buffer.isBuffer(file)) filename = file.toString()
  else if (file instanceof URL) {
    try {
      filename = fileURLToPath(file)
    } catch {
      return undefined
    }
  } else return undefined
  return path
    .relative(repositoryRoot, path.resolve(filename))
    .split(path.sep)
    .join('/')
}

function resolveFixturePath(file) {
  const key = fixtureKey(file)
  return key !== undefined &&
    Object.hasOwn(aliases, key) &&
    !fs.existsSync(file)
    ? path.join(repositoryRoot, aliases[key])
    : file
}

function fixtureFiles(directory) {
  const key = fixtureKey(directory)
  const prefix = key === '' ? '' : key + '/'
  const files = new Set(
    key === undefined
      ? []
      : aliasFiles
          .filter((file) => file.startsWith(prefix))
          .map((file) => file.slice(prefix.length))
  )
  const resolved = resolveFixturePath(directory)
  const filename =
    resolved instanceof URL
      ? fileURLToPath(resolved)
      : Buffer.isBuffer(resolved)
        ? resolved.toString()
        : resolved
  function visit(current, relative) {
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (error) {
      if (relative === '' && error?.code === 'ENOENT' && files.size) return
      throw error
    }
    for (const entry of entries) {
      const name = relative ? relative + '/' + entry.name : entry.name
      if (entry.isDirectory()) visit(path.join(current, entry.name), name)
      else if (entry.isFile()) files.add(name)
      else {
        throw new Error(
          `Fixture source is not a regular file: ${path.join(current, entry.name)}`
        )
      }
    }
  }
  visit(filename, '')
  return [...files].sort()
}

exports.resolveFixturePath = resolveFixturePath
exports.fixtureFiles = fixtureFiles
// Keep native ESM imports outside Jest's VM module loader.
const nativeImporter = new (require('node:module').Module)(__filename)
nativeImporter._compile('module.exports = (url) => import(url)', __filename)
exports.importFixtureModule = (filename) =>
  nativeImporter.exports(pathToFileURL(filename).href)
