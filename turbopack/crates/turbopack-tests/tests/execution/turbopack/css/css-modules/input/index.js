import style from './style.module.css'

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

it('exports the class names of a statically and dynamically imported CSS module', async () => {
  expect(style['module-style']).toMatch(/^[\w-]+_module-style$/)

  const dynamic = await import('./style.module.css')
  expect(dynamic.default).toEqual(style)
})

it('keeps the string value of grid-template-areas', () => {
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  expect(chunks[0]).toContain(
    `.${style['module-style']} {\n  grid-template-areas: "checkbox avatar content actions menu";\n}`
  )
})
