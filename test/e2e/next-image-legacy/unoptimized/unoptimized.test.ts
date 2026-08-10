import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Unoptimized Image Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not optimize any image', async () => {
    const browser = await next.browser('/')

    expect(
      await browser.elementById('internal-image').getAttribute('src')
    ).toMatch('data:')
    expect(
      await browser.elementById('static-image').getAttribute('src')
    ).toMatch('data:')
    expect(
      await browser.elementById('external-image').getAttribute('src')
    ).toMatch('data:')
    expect(
      await browser.elementById('eager-image').getAttribute('src')
    ).toMatch(/\/test\.webp/)

    expect(
      await browser.elementById('internal-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('static-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('external-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('eager-image').getAttribute('srcset')
    ).toBeNull()

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("external-image").scrollIntoView()`
      )
      expect(
        await browser.eval(
          `document.getElementById("external-image").currentSrc`
        )
      ).toBe('https://image-optimization-test.vercel.app/test.jpg')
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("internal-image").scrollIntoView()`
      )
      expect(
        await browser.elementById('internal-image').getAttribute('src')
      ).toMatch(/\/test\.png/)
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("static-image").scrollIntoView()`
      )
      expect(
        normalizeURL(
          await browser.elementById('static-image').getAttribute('src')
        )
      ).toMatch(/\/_next\/static\/media\/test\.HASH\.jpg/)
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("external-image").scrollIntoView()`
      )
      expect(
        await browser.elementById('external-image').getAttribute('src')
      ).toBe('https://image-optimization-test.vercel.app/test.jpg')
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("eager-image").scrollIntoView()`
      )
      expect(
        await browser.elementById('eager-image').getAttribute('src')
      ).toMatch(/\/test\.webp/)
    })

    expect(
      await browser.elementById('internal-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('static-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('external-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('eager-image').getAttribute('srcset')
    ).toBeNull()
  })
})

function normalizeURL(text: string) {
  return text
    .replace(/test\.[0-9a-z_-]{4,}\.(png|jpe?g)/g, 'test.HASH.$1')
    .replace(/_next\/static\/immutable\//g, '_next/static/')
}
