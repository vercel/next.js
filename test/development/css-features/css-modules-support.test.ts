/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe('Has CSS Module in computed styles in Development', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'dev-module'),
  })

  it('should have CSS for page', async () => {
    const browser = await next.browser('/')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#verify-red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
})

describe('Can hot reload CSS Module without losing state', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'hmr-module'),
    patchFileDelay: 500,
  })

  it('should update CSS color without remounting <input>', async () => {
    const browser = await next.browser('/')

    const desiredText = 'hello world'
    await browser.elementById('text-input').type(desiredText)
    expect(await browser.elementById('text-input').getValue()).toBe(desiredText)

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#verify-red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

    await next.patchFile(
      'pages/index.module.css',
      (content) => content.replace('color: red', 'color: purple'),
      async () => {
        await retry(async () => {
          const refreshedColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('#verify-red')).color`
          )
          expect(refreshedColor).toMatchInlineSnapshot(`"rgb(128, 0, 128)"`)
        })

        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )
      }
    )
  })
})
