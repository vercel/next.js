/* eslint-env jest */

import cheerio from 'cheerio'

export default (context, render) => {
  async function get$(path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  it('should render fallback on server side if suspense without preload', async () => {
    const $ = await get$('/suspense/no-preload')
    const nextData = JSON.parse($('#__NEXT_DATA__').text())
    const content = $('#__next').text()
    expect(content).toBe('rab')
    expect(nextData.dynamicIds).toBeUndefined()
  })

  it('should render fallback on server side if suspended on server with preload', async () => {
    const $ = await get$('/suspense/thrown')
    const html = $('body').html()
    expect(html).toContain('loading')
    expect(JSON.parse($('#__NEXT_DATA__').text()).dynamicIds).toBeUndefined()
  })
}
