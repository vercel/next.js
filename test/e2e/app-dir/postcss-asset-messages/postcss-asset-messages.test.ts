import { nextTestSetup } from 'e2e-utils'

describe('postcss-asset-messages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function fetchAsset(name: string) {
    const response = await next.fetch(
      `/_next/static/media/${name}${next.getAssetQuery()}`
    )
    expect(response.status).toBe(200)
    return Buffer.from(await response.arrayBuffer())
  }

  it('emits files from PostCSS asset messages', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').getComputedCss('color')).toBe(
      'rgb(1, 2, 3)'
    )
    expect((await fetchAsset('postcss-text.txt')).toString()).toBe(
      'postcss-text-content'
    )
    expect(await fetchAsset('postcss-binary.bin')).toEqual(
      Buffer.from([0, 255, 128, 10])
    )
  })
})
