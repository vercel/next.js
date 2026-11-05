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

it('flattens nested rules that follow declarations', () => {
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  const prose = (element) =>
    `.prose :where(${element}):not(:where([class~="not-prose"], [class~="not-prose"] *))`
  expect(css).toContain(
    `${prose('table')} tr td:first-child {\n  text-wrap: nowrap;\n}`
  )
  expect(css).toContain(`${prose('table')} {\n  text-wrap: initial;\n}`)
  expect(css).toContain(`${prose('code')} {\n  text-wrap: nowrap;\n}`)
  expect(css).not.toMatch(/\btr \{/)
})
