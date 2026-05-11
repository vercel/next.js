import { nextTestSetup } from 'e2e-utils'

describe('app-dir Image Component from node_modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply image config for node_modules', async () => {
    const browser = await next.browser('/')
    const src = await browser
      .elementById('image-from-node-modules')
      .getAttribute('src')
    expect(src).toMatch('i.imgur.com')

    const srcset = await browser
      .elementById('image-from-node-modules')
      .getAttribute('srcset')
    expect(srcset).toMatch('1234')
  })
})
