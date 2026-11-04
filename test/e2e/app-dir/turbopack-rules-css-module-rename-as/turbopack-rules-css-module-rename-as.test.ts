import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// A `turbopack.rules['*.css']` loader rule with `as: '*.css'` also matches
// `*.module.css`. The rename must not turn CSS Modules into global CSS.
describe('turbopack-rules-css-module-rename-as', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should keep CSS Module class exports scoped', async () => {
    const $ = await next.render$('/')
    const classMap = JSON.parse($('#class-map').text())

    expect(classMap.someClass).toEqual(expect.stringContaining('someClass'))
    expect(classMap.someClass).not.toBe('someClass')
    expect($('#module').attr('class')).toBe(classMap.someClass)
  })

  it('should apply CSS Module and global styles', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(
        await browser.elementByCss('#module').getComputedCss('color')
      ).toBe('rgb(128, 0, 128)')
      expect(
        await browser.elementByCss('#global').getComputedCss('color')
      ).toBe('rgb(0, 0, 255)')
    })
  })
})
