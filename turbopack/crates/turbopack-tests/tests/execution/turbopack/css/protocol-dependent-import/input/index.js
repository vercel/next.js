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

it('keeps protocol-relative imports as external imports', () => {
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(css.match(/^@import .*$/gm)).toEqual([
    '@import "//example.com/something.css";',
    '@import "//somewhere.com/example.css";',
  ])
  expect(css.lastIndexOf('@import')).toBeLessThan(css.indexOf('.foo'))
})
