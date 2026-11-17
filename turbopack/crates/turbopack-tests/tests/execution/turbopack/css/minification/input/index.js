import './style.css'
import style from './style.module.css'
import { readCssChunks } from '../../../__helpers__/css.js'

it('minifies CSS and CSS modules', () => {
  const moduleStyle = style['module-style']
  const inner = style['inner']
  expect(moduleStyle).toMatch(/^[\w-]+_module-style$/)
  expect(inner).toMatch(/^[\w-]+_inner$/)

  const css = readCssChunks(import.meta.url).join('\n')
  expect(css).toContain('.style{color:#ff0}')
  expect(css).toContain(
    `.${moduleStyle}{color:#f0f}.${moduleStyle}>h1,.${moduleStyle}+.${inner}{background:purple}`
  )
  // Minified output has no comments and no indentation.
  expect(css).not.toContain('/* [project]')
  expect(css).not.toMatch(/^ {2}/m)
})
