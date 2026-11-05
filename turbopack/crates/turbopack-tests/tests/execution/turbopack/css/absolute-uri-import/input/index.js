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

it('hoists absolute URL imports to the top of the chunk without duplicates', () => {
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(css.match(/^@import .*$/gm)).toEqual([
    '@import "https://example.com/stylesheet1.css";',
    '@import "https://example.com/withquote\\".css";',
    '@import "https://example.com/stylesheet2.css";',
  ])
  expect(css.lastIndexOf('@import')).toBeLessThan(css.indexOf('.foo'))
})

it('inlines relative imports in order', () => {
  const [css] = readCssChunks()
  expect(cssSources(css)).toEqual([
    'other.css',
    'withduplicateurl.css',
    'index.css',
  ])
})
