import { nextTestSetup } from 'e2e-utils'

describe('app-dir trailingSlash handling', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should redirect route when requesting it directly', async () => {
    const res = await next.fetch('/a', {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)
    expect(new URL(res.headers.get('location'), next.url).pathname).toBe('/a/')
  })

  it('should render link with trailing slash', async () => {
    const $ = await next.render$('/')

    expect($('#to-a-trailing-slash').attr('href')).toBe('/a/')
  })

  it('should contain trailing slash to canonical url', async () => {
    const $ = await next.render$('/')
    expect($(`link[rel="canonical"]`).attr('href')).toBe(
      'http://trailingslash.com/'
    )

    const $a = await next.render$('/a')
    expect($a(`link[rel="canonical"]`).attr('href')).toBe(
      'http://trailingslash.com/a/'
    )
  })

  it('should redirect route when requesting it directly by browser', async () => {
    const browser = await next.browser('/a')
    expect(await browser.waitForElementByCss('#a-page').text()).toBe('A page')
  })

  it('should redirect route when clicking link', async () => {
    const browser = await next.browser('/')
    await browser
      .elementByCss('#to-a-trailing-slash')
      .click()
      .waitForElementByCss('#a-page')
    expect(await browser.waitForElementByCss('#a-page').text()).toBe('A page')
  })

  it('should not add trailing slash to external url or relative url with query', async () => {
    const $ = await next.render$('/metadata')
    expect($('[rel="canonical"]').attr('href')).toBe(
      'http://trailingslash.com/metadata?query=string'
    )
    expect($('[property="og:url"]').attr('content')).toBe(
      'http://trailingslash-another.com/metadata'
    )
  })
})
