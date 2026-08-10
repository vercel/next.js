import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe('Can hot reload CSS without losing state', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures/multi-page'),
  })

  it('should update CSS color without remounting <input>', async () => {
    const browser = await next.browser('/page1')

    const desiredText = 'hello world'
    await browser.elementById('text-input').type(desiredText)
    expect(await browser.elementById('text-input').getValue()).toBe(desiredText)

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.red-text')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

    const cssPath = 'styles/global1.css'
    const originalCss = await next.readFile(cssPath)
    await next.patchFile(
      cssPath,
      originalCss.replace('color: red', 'color: purple')
    )

    try {
      await retry(async () => {
        const color = await browser.eval(
          `window.getComputedStyle(document.querySelector('.red-text')).color`
        )
        expect(color).toBe('rgb(128, 0, 128)')
      })

      expect(await browser.elementById('text-input').getValue()).toBe(
        desiredText
      )
    } finally {
      await next.patchFile(cssPath, originalCss)
    }
  })
})

describe('Has CSS in computed styles in Development', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures/multi-page'),
  })

  it('should have CSS for page', async () => {
    const browser = await next.browser('/page2')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.blue-text')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
  })
})

describe('Body is not hidden when unused in Development', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures/unused'),
  })

  it('should have body visible', async () => {
    const browser = await next.browser('/')
    const currentDisplay = await browser.eval(
      `window.getComputedStyle(document.querySelector('body')).display`
    )
    expect(currentDisplay).toBe('block')
  })
})

describe('Body is not hidden when broken in Development', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures/unused'),
  })

  it('should have body visible', async () => {
    await next.patchFile(
      'pages/index.js',
      (content) => content!.replace('<div />', '<div>'),
      async () => {
        const browser = await next.browser('/')
        await retry(async () => {
          const currentDisplay = await browser.eval(
            `window.getComputedStyle(document.querySelector('body')).display`
          )
          expect(currentDisplay).toBe('block')
        })
      }
    )
  })
})

describe('React Lifecyce Order (dev)', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures/transition-react'),
  })

  it('should have the correct color on mount after navigation', async () => {
    const browser = await next.browser('/')

    await browser.waitForElementByCss('#link-other').click()
    await retry(async () => {
      const text = await browser.elementByCss('#red-title').text()
      expect(text).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
    })
  })
})
