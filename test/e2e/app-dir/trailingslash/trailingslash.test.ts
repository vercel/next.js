import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('app-dir trailingSlash handling', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    buildArgs: [
      '--debug-build-paths',
      isCacheComponentsEnabled
        ? '!app/[lang]/legacy/page.js'
        : '!app/[lang]/cache-components/page.js',
    ],
  })

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

  it.each([{ withSlash: true }, { withSlash: false }])(
    'should revalidate a page with generated static params (withSlash=$withSlash)',
    async ({ withSlash }) => {
      const browser = await next.browser('/en')
      const initialGeneratedAt = await browser
        .elementById('generated-at')
        .text()

      expect(initialGeneratedAt).toBeDateString()

      if (!isNextDev) {
        await browser.refresh()

        const refreshedGeneratedAt = await browser
          .elementById('generated-at')
          .text()

        expect(refreshedGeneratedAt).toBe(initialGeneratedAt)
      }

      await browser
        .elementById(
          withSlash
            ? 'revalidate-button-with-slash'
            : 'revalidate-button-no-slash'
        )
        .click()

      expect(await browser.elementById('revalidate-result').text()).toInclude(
        'Revalidated'
      )

      await retry(async () => {
        await browser.refresh()
        const generatedAt = await browser.elementById('generated-at').text()
        expect(generatedAt).toBeDateString()
        expect(generatedAt).not.toBe(initialGeneratedAt)
      })
    }
  )
})
