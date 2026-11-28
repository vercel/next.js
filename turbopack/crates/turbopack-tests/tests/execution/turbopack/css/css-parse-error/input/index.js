import './style.css'
import { readCssChunks } from '../../../__helpers__/css.js'

it('recovers from an invalid rule and keeps the valid rules around it', () => {
  // The parse errors are reported as issues (see `issues/`).
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  expect(css).toContain('.before{color:red}')
  expect(css).toContain('.after{color:green}')
  expect(css).not.toContain('.invalid')
})

it('keeps rules using newer CSS features', () => {
  const [css] = readCssChunks(import.meta.url)
  expect(css).toContain('::highlight(highlight-test){color:#fff}')
  expect(css).toContain('.carousel{scroll-marker-group:after}')
  expect(css).toContain('.carousel>::scroll-marker{content:""}')
  expect(css).toContain('.carousel>::scroll-marker:target-current{background:')
})
