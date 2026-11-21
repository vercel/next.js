const fs = require('fs')
const path = require('path')

const relativeDir =
  'turbopack/crates/turbopack-tests/tests/execution/turbopack/code-gen/dirname-filename/input'

it('__dirname and __filename should be the real paths of the module', () => {
  expect(path.isAbsolute(__dirname)).toBe(true)
  expect(__dirname).not.toMatch(/^\/ROOT\//)
  expect(__dirname.split(path.sep).join('/')).toMatch(
    new RegExp(`/${relativeDir}$`)
  )
  expect(__filename).toBe(path.join(__dirname, 'index.js'))
  expect({ __dirname, __filename }).toEqual({
    __dirname: path.dirname(__filename),
    __filename,
  })
})

it('should read files relative to __dirname', () => {
  expect(fs.readFileSync(path.join(__dirname, 'data.txt'), 'utf8').trim()).toBe(
    'data'
  )
  expect(require('./nested/reader.js').read()).toBe('nested-data')
})
