import './index.css'
import { cssSources, readCssChunks } from '../../../__helpers__/css.js'

it('wraps a module imported with layer() in that layer', () => {
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(cssSources(css)).toEqual(['import.css', 'index.css'])
  expect(css).toMatch(/@layer new \{\s*h2 \{\s*color: #00f;\s*\}\s*\}/)
  expect(css).toMatch(/@layer default \{\s*h2 \{\s*color: red;\s*\}\s*\}/)
})
