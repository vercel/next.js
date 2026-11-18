import style from './style.module.css'
import { readCssChunks } from '../../../__helpers__/css.js'

it('exports the class names of a statically and dynamically imported CSS module', async () => {
  expect(style['module-style']).toMatch(/^[\w-]+_module-style$/)

  const dynamic = await import('./style.module.css')
  expect(dynamic.default).toEqual(style)
})

it('keeps the string value of grid-template-areas', () => {
  const chunks = readCssChunks(import.meta.url)
  expect(chunks).toHaveLength(1)
  expect(chunks[0]).toContain(
    `.${style['module-style']} {\n  grid-template-areas: "checkbox avatar content actions menu";\n}`
  )
})
