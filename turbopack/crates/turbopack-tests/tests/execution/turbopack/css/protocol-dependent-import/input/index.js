import './index.css'
import { readCssChunks } from '../../../__helpers__/css.js'

it('keeps protocol-relative imports as external imports', () => {
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(css.match(/^@import .*$/gm)).toEqual([
    '@import "//example.com/something.css";',
    '@import "//somewhere.com/example.css";',
  ])
  expect(css.lastIndexOf('@import')).toBeLessThan(css.indexOf('.foo'))
})
