import './style.css'
import { readCssChunks } from '../../../__helpers__/css.js'

it('keeps url() in a @supports query unchanged', () => {
  // The `url('')` references are not resolved, so no issues are reported.
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  expect(chunks[0]).toContain(
    "@supports ((-webkit-mask: url('')) or (mask: url(''))) {\n  .supports-url-in-query {\n    color: red;\n  }\n}"
  )
})
