import './style.css'
import { readCssChunks } from '../../../__helpers__/css.js'

it('flattens nested rules that follow declarations', () => {
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  const [css] = chunks

  const prose = (element) =>
    `.prose :where(${element}):not(:where([class~="not-prose"], [class~="not-prose"] *))`
  expect(css).toContain(
    `${prose('table')} tr td:first-child {\n  text-wrap: nowrap;\n}`
  )
  expect(css).toContain(`${prose('table')} {\n  text-wrap: initial;\n}`)
  expect(css).toContain(`${prose('code')} {\n  text-wrap: nowrap;\n}`)
  expect(css).not.toMatch(/\btr \{/)
})
