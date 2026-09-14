import { nextTestSetup } from 'e2e-utils'

describe('Image Component Unicode Image URL', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load static unicode image', async () => {
    const browser = await next.browser('/')
    const src = await browser.elementById('static').getAttribute('src')
    expect(src).toMatch(
      /_next%2Fstatic%2F(immutable%2F)?media%2F%C3%A4%C3%B6%C3%BC%C5%A1%C4%8D%C5%99%C3%AD(.+)png/
    )
    const fullSrc = new URL(src, next.url)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load internal unicode image', async () => {
    const browser = await next.browser('/')
    const src = await browser.elementById('internal').getAttribute('src')
    expect(src).toMatch(
      '/_next/image?url=%2F%C3%A4%C3%B6%C3%BC%C5%A1%C4%8D%C5%99%C3%AD.png'
    )
    const fullSrc = new URL(src, next.url)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load external unicode image', async () => {
    const browser = await next.browser('/')
    const src = await browser.elementById('external').getAttribute('src')
    expect(src).toMatch(
      '/_next/image?url=https%3A%2F%2Fimage-optimization-test.vercel.app%2F%C3%A4%C3%B6%C3%BC%C5%A1%C4%8D%C5%99%C3%AD.png'
    )
    const fullSrc = new URL(src, next.url)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load internal image with space', async () => {
    const browser = await next.browser('/')
    const src = await browser.elementById('internal-space').getAttribute('src')
    expect(src).toMatch('/_next/image?url=%2Fhello%2520world.jpg')
    const fullSrc = new URL(src, next.url)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })

  it('should load external image with space', async () => {
    const browser = await next.browser('/')
    const src = await browser.elementById('external-space').getAttribute('src')
    expect(src).toMatch(
      '/_next/image?url=https%3A%2F%2Fimage-optimization-test.vercel.app%2Fhello%2520world.jpg'
    )
    const fullSrc = new URL(src, next.url)
    const res = await fetch(fullSrc)
    expect(res.status).toBe(200)
  })
})
