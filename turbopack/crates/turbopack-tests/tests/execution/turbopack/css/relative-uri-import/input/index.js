import './index.css'
import { cssSources, readCssChunks } from '../../../__helpers__/css.js'

it('resolves bare @import requests relative to the importing file', () => {
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(cssSources(css)).toEqual(['another.css', 'other.css', 'index.css'])
  expect(css).not.toContain('@import')
})
