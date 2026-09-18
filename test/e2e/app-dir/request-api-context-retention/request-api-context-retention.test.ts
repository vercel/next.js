import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

function expectDetachedRequestApis(html: string) {
  const $ = cheerio.load(html)
  expect($('#control-captures-work-store').text()).toBe('true')
  expect($('#control-captures-work-unit-store').text()).toBe('true')
  expect($('#cookies-captures-work-store').text()).toBe('false')
  expect($('#cookies-captures-work-unit-store').text()).toBe('false')
  expect($('#headers-captures-work-store').text()).toBe('false')
  expect($('#headers-captures-work-unit-store').text()).toBe('false')
  expect($('#draft-mode-captures-work-store').text()).toBe('false')
  expect($('#draft-mode-captures-work-unit-store').text()).toBe('false')
}

describe('request api context retention', () => {
  const { next, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextStart && !isNextDeploy) {
    it.skip('only runs in production modes', () => {})
    return
  }

  it('does not retain a dynamic request context through request apis', async () => {
    const response = await next.fetch('/session-apis')

    expect(response.status).toBe(200)
    expectDetachedRequestApis(await response.text())
  })

  it('does not retain the prerender context through request apis', async () => {
    // The static page is prerendered at build time. Its cookies()/headers()
    // promises resolve to empty request data through the forceStatic
    // override path, and draftMode() resolves to an empty DraftMode through
    // the prerender branch; all of those promises must be created without
    // capturing the prerender's async-local stores.
    const response = await next.fetch('/static-apis')

    expect(response.status).toBe(200)
    expectDetachedRequestApis(await response.text())
  })
})
