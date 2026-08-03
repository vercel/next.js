import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

function expectDetachedRequestProps(html: string) {
  const $ = cheerio.load(html)
  expect($('#control-captures-work-store').text()).toBe('true')
  expect($('#control-captures-work-unit-store').text()).toBe('true')
  expect($('#params-captures-work-store').text()).toBe('false')
  expect($('#params-captures-work-unit-store').text()).toBe('false')
  expect($('#search-params-captures-work-store').text()).toBe('false')
  expect($('#search-params-captures-work-unit-store').text()).toBe('false')
}

describe('request context retention', () => {
  const { next, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextStart && !isNextDeploy) {
    it.skip('only runs in production modes', () => {})
    return
  }

  it('does not retain the prerender context through request props', async () => {
    let response: Awaited<ReturnType<typeof next.fetch>>
    if (isNextStart) {
      const prerenderManifest = await next.readJSON(
        '.next/prerender-manifest.json'
      )
      response = await next.fetch('/test', {
        headers: {
          'x-prerender-revalidate': prerenderManifest.preview.previewModeId,
        },
      })
    } else {
      // Deploy mode cannot access the build output or use the private
      // revalidation header, but the prerendered response still verifies
      // the build-time request-prop promise context.
      response = await next.fetch('/test')
    }

    expect(response.status).toBe(200)
    expectDetachedRequestProps(await response.text())
  })

  it('does not retain a dynamic request context through request props', async () => {
    const response = await next.fetch('/dynamic/test?query=value')

    expect(response.status).toBe(200)

    const html = await response.text()
    expectDetachedRequestProps(html)
    expect(cheerio.load(html)('#query').text()).toBe('value')
  })

  it('preserves searchParams behavior in a nested cache context', async () => {
    const response = await next.fetch('/nested-cache?query=value')

    expect(response.status).toBe(200)
    expect(
      cheerio
        .load(await response.text())('#query')
        .text()
    ).toBe('value')
  })
})
