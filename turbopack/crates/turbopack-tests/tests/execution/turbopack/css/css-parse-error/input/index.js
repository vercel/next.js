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

it('recovers from an invalid rule and keeps the valid rules around it', () => {
  // The parse errors are reported as issues (see `issues/`).
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(css).toContain('.before{color:red}')
  expect(css).toContain('.after{color:green}')
  expect(css).not.toContain('.invalid')
})

it('keeps rules using newer CSS features', () => {
  const [css] = readCssChunks()
  expect(css).toContain('::highlight(highlight-test){color:#fff}')
  expect(css).toContain('.carousel{scroll-marker-group:after}')
  expect(css).toContain('.carousel>::scroll-marker{content:""}')
  expect(css).toContain('.carousel>::scroll-marker:target-current{background:')
})
