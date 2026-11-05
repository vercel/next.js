import 'foo/style.css'
import 'foo'
import './style.css'
import fooStyle from 'foo/style.module.css'
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

// The source files of the modules in a CSS chunk, in order, with the import
// attributes they were imported with.
function cssSources(css) {
  return Array.from(
    css.matchAll(
      /\/\* \[project\]\/\S*\/input\/(\S+) \[test\] \((.*?)\) \*\//g
    ),
    (match) => `${match[1]} (${match[2]})`
  )
}

it('composes class names from a CSS module in a package', () => {
  const fooClass = fooStyle['foo-module-style']
  expect(fooClass).toMatch(/^[\w-]+_foo-module-style$/)
  expect(style['module-style']).toMatch(/^[\w-]+_module-style$/)
  for (const name of [
    'composed-module-style',
    'another-composed-module-style',
  ]) {
    const [own, composed, ...rest] = style[name].split(' ')
    expect(own).toMatch(new RegExp(`^[\\w-]+_${name}$`))
    expect(composed).toBe(fooClass)
    expect(rest).toEqual([])
  }
})

// The chunk containing the statically imported CSS.
function mainCssChunk() {
  const chunks = readCssChunks().filter((css) =>
    cssSources(css).includes('style.module.css (css)')
  )
  expect(chunks).toHaveLength(1)
  return chunks[0]
}

it('loads a CSS package dynamically', async () => {
  // `foo` resolves to `foo/style.css` via `main`.
  await import('foo')
})

it('includes each CSS module once, deduplicating imports with the same attributes', () => {
  const css = mainCssChunk()
  expect(cssSources(css)).toEqual([
    'node_modules/foo/style.css (css)',
    'imported.css (css)',
    'imported.css (css, layer(layer) print)',
    'style.css (css)',
    'node_modules/foo/style.module.css (css)',
    'style.module.css (css)',
  ])
  expect(css).toMatch(
    /@layer layer \{\s*@media print \{\s*\.imported \{\s*color: #0ff;/
  )
  // `foo/index.css` is not the `main` of the package.
  expect(css).not.toContain('.foo-index')
})

it('flattens nested rules in CSS modules', () => {
  const css = mainCssChunk()
  const moduleStyle = style['module-style']
  expect(css).toContain(
    `.${moduleStyle} > h1, .${moduleStyle} + .${style['inner']} {\n  background: purple;\n}`
  )
})
