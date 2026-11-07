import './style.css'
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

it('minifies CSS and CSS modules', () => {
  const moduleStyle = style['module-style']
  const inner = style['inner']
  expect(moduleStyle).toMatch(/^[\w-]+_module-style$/)
  expect(inner).toMatch(/^[\w-]+_inner$/)

  const css = readCssChunks().join('\n')
  expect(css).toContain('.style{color:#ff0}')
  expect(css).toContain(
    `.${moduleStyle}{color:#f0f}.${moduleStyle}>h1,.${moduleStyle}+.${inner}{background:purple}`
  )
  // Minified output has no comments and no indentation.
  expect(css).not.toContain('/* [project]')
  expect(css).not.toMatch(/^ {2}/m)
})
