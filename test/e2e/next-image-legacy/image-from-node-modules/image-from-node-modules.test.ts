import { nextTestSetup } from 'e2e-utils'

describe('Image Component Tests for node_modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply image config for node_modules', async () => {
    const browser = await next.browser('/image-from-node-modules')
    expect(
      await browser.elementById('image-from-node-modules').getAttribute('src')
    ).toMatch('i.imgur.com')
  })
})
