import './index.css'
import { cssSources, readCssChunks } from '../../../__helpers__/css.js'

it('hoists absolute URL imports to the top of the chunk without duplicates', () => {
  const chunks = readCssChunks(import.meta.url)
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
  const [css] = readCssChunks(import.meta.url)
  expect(cssSources(css)).toEqual([
    'other.css',
    'withduplicateurl.css',
    'index.css',
  ])
})
