import './style.css'

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

it('keeps url() in a @supports query unchanged', () => {
  // The `url('')` references are not resolved, so no issues are reported.
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  expect(chunks[0]).toContain(
    "@supports ((-webkit-mask: url('')) or (mask: url(''))) {\n  .supports-url-in-query {\n    color: red;\n  }\n}"
  )
})
