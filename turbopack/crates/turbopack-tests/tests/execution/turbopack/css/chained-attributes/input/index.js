import './style.css'
import {
  cssSourcesWithAttributes,
  readCssChunks,
} from '../../../__helpers__/css.js'

it('chains layer, media and supports attributes of nested imports', () => {
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  const supports = 'supports(not(display: inline-grid))'
  const woff2 = 'supports(font-format(woff2))'
  expect(cssSourcesWithAttributes(css)).toEqual([
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
