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

it('chains layer, media and supports attributes of nested imports', () => {
  const chunks = readCssChunks()
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  const supports = 'supports(not(display: inline-grid))'
  const woff2 = 'supports(font-format(woff2))'
  expect(cssSources(css)).toEqual([
    `c.css (css, layer(layer) layer(foo) print and (orientation: landscape) ${supports} ${woff2})`,
    `c.css (css, layer(layer) layer(bar) print and (orientation: portrait) ${supports} ${woff2})`,
    `b.css (css, layer(layer) print ${supports} ${woff2})`,
    `a.css (css, layer(layer) print ${supports})`,
    'style.css (css)',
  ])

  const wrapped = (layer, media, supports, color) =>
    new RegExp(
      `@layer ${layer} \\{\\s*@media ${media} \\{\\s*@supports ${supports} \\{\\s*\\.imported \\{\\s*color: ${color};`
    )
  const allSupports = 'not\\(display: inline-grid\\) and font-format\\(woff2\\)'
  expect(css).toMatch(
    wrapped(
      'layer\\.foo',
      'print and \\(orientation: landscape\\)',
      allSupports,
      'red'
    )
  )
  expect(css).toMatch(
    wrapped(
      'layer\\.bar',
      'print and \\(orientation: portrait\\)',
      allSupports,
      'red'
    )
  )
  expect(css).toMatch(wrapped('layer', 'print', allSupports, 'orange'))
  expect(css).toMatch(
    wrapped('layer', 'print', 'not\\(display: inline-grid\\)', '#0ff')
  )
})
