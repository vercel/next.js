/* eslint-env jest */
/* global page, server */

describe('with SSR', () => {
  it('should handle beginning slash properly', async () => {
    const $ = await server.fetch$('/using-asset/asset')
    expect($('#img1').attr('src')).toBe('/static/the-image')
    expect($('#img2').attr('src')).toBe('/static/the-image')
  })

  it('should handle http(s) properly', async () => {
    const $ = await server.fetch$('/using-asset/asset')
    expect($('#img3').attr('src')).toBe('http://the-image.com/the-image')
    expect($('#img4').attr('src')).toBe('https://the-image.com/the-image')
  })
})

describe('with client navigation', () => {
  it('should handle beginning slash properly', async () => {
    await page.goto(server.getURL('/using-asset'))

    await expect(page).toClick('#go-asset')
    await expect(page).toMatchElement('#asset-page')

    const img1 = await expect(page).toMatchElement('#img1')
    /* istanbul ignore next */
    const img1Src = await page.evaluate(e => e.getAttribute('src'), img1)
    expect(img1Src).toBe('/static/the-image')

    const img2 = await expect(page).toMatchElement('#img2')

    /* istanbul ignore next */
    const img2Src = await page.evaluate(e => e.getAttribute('src'), img2)
    expect(img2Src).toBe('/static/the-image')
  })

  it('should handle http(s) properly', async () => {
    await page.goto(server.getURL('/using-asset'))

    await expect(page).toClick('#go-asset')
    await expect(page).toMatchElement('#asset-page')

    const img3 = await expect(page).toMatchElement('#img3')

    /* istanbul ignore next */
    const img3Src = await page.evaluate(e => e.getAttribute('src'), img3)
    expect(img3Src).toBe('http://the-image.com/the-image')

    const img4 = await expect(page).toMatchElement('#img4')

    /* istanbul ignore next */
    const img4Src = await page.evaluate(e => e.getAttribute('src'), img4)
    expect(img4Src).toBe('https://the-image.com/the-image')
  })
})
