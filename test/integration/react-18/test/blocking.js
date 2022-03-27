/* eslint-env jest */

import cheerio from 'cheerio'

export default (context, render) => {
  async function get$(path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  it('should render fallback on server side if suspense without ssr', async () => {
    const $ = await get$('/suspense/no-preload')
    const nextData = JSON.parse($('#__NEXT_DATA__').text())
    const content = $('#__next').text()
    expect(content).toBe('fallback')
    expect(nextData.dynamicIds).toBeUndefined()
  })

  // Testing the same thing as above.
  it.skip('should render import fallback on server side if suspended without ssr', async () => {
    const $ = await get$('/suspense/thrown')
    const html = $('body').html()
    expect(html).toContain('loading')
    expect(JSON.parse($('#__NEXT_DATA__').text()).dynamicIds).toBeUndefined()
  })
}
