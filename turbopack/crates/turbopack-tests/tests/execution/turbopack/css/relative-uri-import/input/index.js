import './index.css'

const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')

// The execution harness writes the emitted CSS chunks to `output/`.
function readCssChunks() {
  const dir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'output'
  )
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
}

// The source files of the modules in a CSS chunk, in order.
function cssSources(css) {
  return Array.from(
    css.matchAll(/\/\* \[project\]\/\S*\/input\/(\S+) \[test\] \(css/g),
    (match) => match[1]
  )
}

it('resolves bare @import requests relative to the importing file', () => {
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(cssSources(css)).toEqual(['another.css', 'other.css', 'index.css'])
  expect(css).not.toContain('@import')
})
